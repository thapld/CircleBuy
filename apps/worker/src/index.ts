import "dotenv/config";
import { Pool } from "pg";
import pino from "pino";
import { createPublicClient, http, parseAbiItem } from "viem";
import { z } from "zod";
import { ARC_TESTNET } from "@arcgroup/shared";

const logger = pino({ name: "arcgroup-worker" });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ARC_RPC_URL: z.string().url().default(ARC_TESTNET.rpcUrl),
  ARC_CHAIN_ID: z.coerce.number().int().positive().default(ARC_TESTNET.chainId),
  ESCROW_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  WORKER_START_BLOCK: z.coerce.number().int().nonnegative().default(0),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000)
});

const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  ARC_RPC_URL: process.env.ARC_RPC_URL,
  ARC_CHAIN_ID: process.env.ARC_CHAIN_ID,
  ESCROW_FACTORY_ADDRESS: process.env.ESCROW_FACTORY_ADDRESS,
  WORKER_START_BLOCK: process.env.WORKER_START_BLOCK,
  WORKER_POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS
});

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });

const publicClient = createPublicClient({
  transport: http(env.ARC_RPC_URL)
});

const dealCreatedEvent = parseAbiItem(
  "event DealCreated(address indexed dealAddress,address indexed organizer,bytes32 inviteCodeHash,uint32 minParticipants,uint32 maxParticipants,uint256 unitPrice,uint256 depositPerParticipant,uint64 depositDeadline,uint64 finalDeadline)"
);

async function getCursor(name: string) {
  const row = await pool.query<{ last_block: string }>(
    `select last_block from sync_state where name = $1 limit 1`,
    [name]
  );

  if (row.rowCount === 0) {
    await pool.query(
      `insert into sync_state (name, last_block) values ($1, $2)
       on conflict (name) do nothing`,
      [name, String(env.WORKER_START_BLOCK)]
    );
    return BigInt(env.WORKER_START_BLOCK);
  }

  return BigInt(row.rows[0].last_block);
}

async function setCursor(name: string, block: bigint) {
  await pool.query(
    `insert into sync_state (name, last_block)
     values ($1, $2)
     on conflict (name) do update
       set last_block = excluded.last_block,
           updated_at = now()`,
    [name, String(block)]
  );
}

async function syncFactoryEvents() {
  const cursorName = "factory_logs";
  const fromBlock = (await getCursor(cursorName)) + 1n;
  const latest = await publicClient.getBlockNumber();

  if (fromBlock > latest) return;

  const logs = await publicClient.getLogs({
    address: env.ESCROW_FACTORY_ADDRESS as `0x${string}`,
    event: dealCreatedEvent,
    fromBlock,
    toBlock: latest
  });

  for (const log of logs) {
    const args = log.args;
    if (!args) continue;
    if (
      args.unitPrice === undefined ||
      args.depositPerParticipant === undefined ||
      args.minParticipants === undefined ||
      args.maxParticipants === undefined ||
      args.depositDeadline === undefined ||
      args.finalDeadline === undefined
    ) {
      continue;
    }

    const txHash = log.transactionHash ?? "0x";
    const logIndex = Number(log.logIndex ?? 0n);
    const blockNumber = log.blockNumber ? String(log.blockNumber) : "0";

    await pool.query(
      `insert into chain_events (
         chain_id,
         tx_hash,
         log_index,
         contract_address,
         event_name,
         payload,
         block_number,
         block_timestamp
       ) values ($1,$2,$3,$4,'DealCreated',$5::jsonb,$6,to_timestamp($7))
       on conflict (chain_id, tx_hash, log_index) do nothing`,
      [
        env.ARC_CHAIN_ID,
        txHash,
        logIndex,
        env.ESCROW_FACTORY_ADDRESS.toLowerCase(),
        JSON.stringify({
          dealAddress: args.dealAddress,
          organizer: args.organizer,
          inviteCodeHash: args.inviteCodeHash,
          minParticipants: Number(args.minParticipants),
          maxParticipants: Number(args.maxParticipants),
          unitPrice: args.unitPrice.toString(),
          depositPerParticipant: args.depositPerParticipant.toString(),
          depositDeadline: Number(args.depositDeadline),
          finalDeadline: Number(args.finalDeadline)
        }),
        blockNumber,
        Number(args.depositDeadline)
      ]
    );

    await pool.query(
      `insert into deals (
         deal_address,
         organizer_wallet,
         title,
         invite_code_hash,
         unit_price,
         deposit_per_participant,
         min_participants,
         max_participants,
         deposit_deadline_at,
         final_deadline_at,
         status,
         onchain_tx_hash,
         onchain_block_number,
         created_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9),to_timestamp($10),'deposit_open',$11,$12,now()
       )
       on conflict (deal_address) do update
         set organizer_wallet = excluded.organizer_wallet,
             invite_code_hash = excluded.invite_code_hash,
             unit_price = excluded.unit_price,
             deposit_per_participant = excluded.deposit_per_participant,
             min_participants = excluded.min_participants,
             max_participants = excluded.max_participants,
             deposit_deadline_at = excluded.deposit_deadline_at,
             final_deadline_at = excluded.final_deadline_at,
             onchain_tx_hash = excluded.onchain_tx_hash,
             onchain_block_number = excluded.onchain_block_number,
             updated_at = now()`,
      [
        args.dealAddress,
        args.organizer,
        "On-chain created deal",
        args.inviteCodeHash,
        args.unitPrice.toString(),
        args.depositPerParticipant.toString(),
        Number(args.minParticipants),
        Number(args.maxParticipants),
        Number(args.depositDeadline),
        Number(args.finalDeadline),
        txHash,
        blockNumber
      ]
    );
  }

  await setCursor(cursorName, latest);
  logger.info(
    { fromBlock: String(fromBlock), toBlock: String(latest), logCount: logs.length },
    "factory logs synced"
  );
}

async function promoteDealsByParticipants() {
  const depositPromoted = await pool.query<{ deal_address: string }>(
    `update deals
     set status = 'final_payment_open',
         status_reason = 'deposit_quorum_reached',
         updated_at = now()
     where status = 'deposit_open'
       and deposit_paid_participants >= min_participants
       and now() <= deposit_deadline_at
     returning deal_address`
  );

  if ((depositPromoted.rowCount ?? 0) > 0) {
    logger.info(
      { count: depositPromoted.rowCount ?? 0 },
      "deals promoted to final_payment_open"
    );
  }

  const finalPromoted = await pool.query<{ deal_address: string }>(
    `update deals
     set status = 'ready_to_order',
         status_reason = 'final_quorum_reached',
         updated_at = now()
     where status = 'final_payment_open'
       and final_paid_participants >= min_participants
       and now() <= final_deadline_at
     returning deal_address`
  );

  if ((finalPromoted.rowCount ?? 0) > 0) {
    logger.info({ count: finalPromoted.rowCount ?? 0 }, "deals promoted to ready_to_order");
  }
}

async function markExpiredDeals() {
  const result = await pool.query<{ deal_address: string }>(
    `update deals
     set status = 'refunding',
         status_reason = 'deadline_expired',
         updated_at = now()
     where status in ('deposit_open', 'final_payment_open')
       and (
         (status = 'deposit_open' and now() > deposit_deadline_at)
         or
         (status = 'final_payment_open' and now() > final_deadline_at)
       )
     returning deal_address`
  );

  if ((result.rowCount ?? 0) > 0) {
    logger.warn({ count: result.rowCount ?? 0 }, "expired deals marked as refunding");
  }
}

async function checkChainId() {
  const chainId = await publicClient.getChainId();
  if (chainId !== env.ARC_CHAIN_ID) {
    logger.warn({ expected: env.ARC_CHAIN_ID, actual: chainId }, "chain id mismatch");
  }
}

async function run() {
  logger.info({ rpc: env.ARC_RPC_URL, chainId: env.ARC_CHAIN_ID }, "worker started");
  await checkChainId();

  while (true) {
    try {
      await syncFactoryEvents();
      await promoteDealsByParticipants();
      await markExpiredDeals();
    } catch (error) {
      logger.error({ error }, "worker iteration failed");
    }

    await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
  }
}

run().catch((error) => {
  logger.fatal({ error }, "worker crashed");
  process.exit(1);
});
