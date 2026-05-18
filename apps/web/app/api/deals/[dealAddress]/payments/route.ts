import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";

const paramsSchema = z.object({
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

const paymentSchema = z.object({
  participantWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  phase: z.enum(["deposit", "final"]),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ dealAddress: string }> }
) {
  const [params, body] = await Promise.all([context.params, req.json()]);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedParams.error.flatten() },
      { status: 400 }
    );
  }

  const parsedBody = paymentSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const { dealAddress } = parsedParams.data;
  const { participantWallet, phase, txHash } = parsedBody.data;

  const result = await withTransaction(async (client) => {
    const dealRows = await client.query<{
      id: string;
      status: string;
      organizer_wallet: string;
    }>(
      `select id, status, organizer_wallet
       from deals
       where deal_address = $1
       limit 1`,
      [dealAddress]
    );

    if ((dealRows.rowCount ?? 0) === 0) return { error: "deal_not_found" as const };
    const deal = dealRows.rows[0];

    const membershipRows = await client.query<{
      id: string;
      deposit_paid_at: Date | null;
      final_paid_at: Date | null;
    }>(
      `select id, deposit_paid_at, final_paid_at
       from deal_memberships
       where deal_id = $1 and participant_wallet = $2
       limit 1
       for update`,
      [deal.id, participantWallet]
    );

    if ((membershipRows.rowCount ?? 0) === 0) return { error: "membership_not_found" as const };
    const membership = membershipRows.rows[0];

    if (phase === "deposit") {
      if (deal.status !== "deposit_open" && deal.status !== "final_payment_open") {
        return { error: "invalid_state" as const };
      }
      if (!membership.deposit_paid_at) {
        await client.query(
          `update deal_memberships
           set deposit_paid_at = now(),
               deposit_tx_hash = $1
           where id = $2`,
          [txHash, membership.id]
        );
      }
    }

    if (phase === "final") {
      if (deal.status !== "final_payment_open" && deal.status !== "ready_to_order") {
        return { error: "invalid_state" as const };
      }
      if (!membership.deposit_paid_at) {
        return { error: "deposit_required" as const };
      }
      if (!membership.final_paid_at) {
        await client.query(
          `update deal_memberships
           set final_paid_at = now(),
               final_tx_hash = $1
           where id = $2`,
          [txHash, membership.id]
        );
      }
    }

    await client.query(
      `update deals
       set deposit_paid_participants = (
             select count(*)::int
             from deal_memberships
             where deal_id = $1 and deposit_paid_at is not null
           ),
           final_paid_participants = (
             select count(*)::int
             from deal_memberships
             where deal_id = $1 and final_paid_at is not null
           ),
           updated_at = now()
       where id = $1`,
      [deal.id]
    );

    await client.query(
      `insert into audit_logs (actor_wallet, action, entity_type, entity_id, metadata)
       values ($1, $2, 'deal', $3, $4::jsonb)`,
      [
        participantWallet,
        phase === "deposit" ? "mark_deposit_paid" : "mark_final_paid",
        dealAddress,
        JSON.stringify({ txHash })
      ]
    );

    return { ok: true as const };
  });

  if ("error" in result) {
    const statusByError: Record<string, number> = {
      deal_not_found: 404,
      membership_not_found: 404,
      invalid_state: 409,
      deposit_required: 409
    };
    const errorCode = String(result.error);
    return NextResponse.json({ error: errorCode }, { status: statusByError[errorCode] ?? 400 });
  }

  return NextResponse.json({ ok: true });
}
