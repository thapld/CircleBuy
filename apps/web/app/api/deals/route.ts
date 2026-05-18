import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEAL_STATUSES } from "@arcgroup/shared";
import { query, withTransaction } from "@/lib/db";
import { requireInviteSigningSecret } from "@/lib/env";
import { createInviteToken, hashInviteCode } from "@/lib/invite";

const createDealSchema = z.object({
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  organizerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  title: z.string().min(3).max(120),
  inviteCode: z.string().min(8).max(128),
  unitPrice: z.string().min(1),
  depositPerParticipant: z.string().min(1),
  minParticipants: z.number().int().positive(),
  maxParticipants: z.number().int().positive(),
  depositDeadlineAt: z.string().datetime(),
  finalDeadlineAt: z.string().datetime(),
  inviteExpiresAt: z.string().datetime().optional(),
  inviteMaxUses: z.number().int().positive().optional()
});

const listQuerySchema = z.object({
  status: z.enum(DEAL_STATUSES).optional()
});

export async function GET(req: NextRequest) {
  const parsedQuery = listQuerySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedQuery.error.flatten() },
      { status: 400 }
    );
  }

  const statusFilter = parsedQuery.data.status;
  const deals = await query(
    `select
      id,
      deal_address as "dealAddress",
      organizer_wallet as "organizerWallet",
      title,
      status,
      status_reason as "statusReason",
      unit_price as "unitPrice",
      deposit_per_participant as "depositPerParticipant",
      min_participants as "minParticipants",
      max_participants as "maxParticipants",
      current_participants as "currentParticipants",
      deposit_deadline_at as "depositDeadlineAt",
      final_deadline_at as "finalDeadlineAt",
      created_at as "createdAt"
    from deals
    where ($1::text is null or status = $1)
    order by created_at desc
    limit 100`,
    [statusFilter ?? null]
  );

  return NextResponse.json({ deals });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createDealSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const p = parsed.data;
  if (p.maxParticipants < p.minParticipants) {
    return NextResponse.json(
      { error: "invalid_payload", details: { maxParticipants: ["must be >= minParticipants"] } },
      { status: 400 }
    );
  }

  const depositDeadline = new Date(p.depositDeadlineAt);
  const finalDeadline = new Date(p.finalDeadlineAt);
  if (depositDeadline >= finalDeadline) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        details: { deadlines: ["depositDeadlineAt must be before finalDeadlineAt"] }
      },
      { status: 400 }
    );
  }

  const inviteExpiresAt = p.inviteExpiresAt ? new Date(p.inviteExpiresAt) : depositDeadline;
  if (inviteExpiresAt > finalDeadline) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        details: { inviteExpiresAt: ["must not be later than finalDeadlineAt"] }
      },
      { status: 400 }
    );
  }

  const inviteCodeHash = hashInviteCode(p.inviteCode);
  const inviteMaxUses = p.inviteMaxUses ?? p.maxParticipants;
  const inviteToken = createInviteToken({
    dealAddress: p.dealAddress,
    inviteCodeHash,
    maxUses: inviteMaxUses,
    expiresAt: inviteExpiresAt,
    secret: requireInviteSigningSecret()
  });

  const result = await withTransaction(async (client) => {
    const upserted = await client.query<{ id: string }>(
      `insert into deals (
        deal_address,
        organizer_wallet,
        title,
        invite_code,
        invite_code_hash,
        unit_price,
        deposit_per_participant,
        min_participants,
        max_participants,
        deposit_deadline_at,
        final_deadline_at
      ) values ($1,$2,$3,null,$4,$5,$6,$7,$8,$9,$10)
      on conflict (deal_address) do update
        set organizer_wallet = excluded.organizer_wallet,
            title = excluded.title,
            invite_code = null,
            invite_code_hash = excluded.invite_code_hash,
            unit_price = excluded.unit_price,
            deposit_per_participant = excluded.deposit_per_participant,
            min_participants = excluded.min_participants,
            max_participants = excluded.max_participants,
            deposit_deadline_at = excluded.deposit_deadline_at,
            final_deadline_at = excluded.final_deadline_at,
            updated_at = now()
      returning id`,
      [
        p.dealAddress,
        p.organizerWallet,
        p.title,
        inviteCodeHash,
        p.unitPrice,
        p.depositPerParticipant,
        p.minParticipants,
        p.maxParticipants,
        p.depositDeadlineAt,
        p.finalDeadlineAt
      ]
    );

    const dealId = upserted.rows[0].id;

    await client.query(
      `insert into invite_tokens (
        deal_id,
        token_id,
        invite_code_hash,
        expires_at,
        max_uses,
        created_by_wallet
      ) values ($1,$2,$3,$4,$5,$6)`,
      [
        dealId,
        inviteToken.payload.tokenId,
        inviteCodeHash,
        inviteExpiresAt.toISOString(),
        inviteMaxUses,
        p.organizerWallet
      ]
    );

    await client.query(
      `insert into audit_logs (actor_wallet, action, entity_type, entity_id, metadata)
       values ($1, 'create_deal', 'deal', $2, $3::jsonb)`,
      [
        p.organizerWallet,
        p.dealAddress,
        JSON.stringify({
          minParticipants: p.minParticipants,
          maxParticipants: p.maxParticipants,
          unitPrice: p.unitPrice,
          depositPerParticipant: p.depositPerParticipant,
          inviteTokenId: inviteToken.payload.tokenId
        })
      ]
    );

    return { dealId };
  });

  return NextResponse.json({
    ok: true,
    dealId: result.dealId,
    inviteToken: inviteToken.token,
    inviteTokenId: inviteToken.payload.tokenId,
    inviteExpiresAt: inviteExpiresAt.toISOString()
  });
}
