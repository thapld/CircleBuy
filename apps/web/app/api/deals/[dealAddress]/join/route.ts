import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { requireInviteSigningSecret } from "@/lib/env";
import { verifyInviteToken } from "@/lib/invite";

const paramsSchema = z.object({
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

const joinSchema = z.object({
  participantWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  inviteToken: z.string().min(32)
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
  const parsedBody = joinSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const { dealAddress } = parsedParams.data;
  const { participantWallet, inviteToken } = parsedBody.data;
  const payload = verifyInviteToken(inviteToken, requireInviteSigningSecret());

  if (!payload) {
    return NextResponse.json({ error: "invalid_invite_token" }, { status: 401 });
  }
  if (payload.dealAddress.toLowerCase() !== dealAddress.toLowerCase()) {
    return NextResponse.json({ error: "invalid_invite_token" }, { status: 401 });
  }
  if (payload.exp * 1000 < Date.now()) {
    return NextResponse.json({ error: "invite_expired" }, { status: 410 });
  }

  const result = await withTransaction(async (client) => {
    const dealRows = await client.query<{ id: string; status: string; max_participants: number }>(
      `select id, status, max_participants
       from deals
       where deal_address = $1
       limit 1`,
      [dealAddress]
    );

    if ((dealRows.rowCount ?? 0) === 0) {
      return { error: "deal_not_found" as const };
    }

    const deal = dealRows.rows[0];
    if (deal.status !== "deposit_open" && deal.status !== "final_payment_open") {
      return { error: "invalid_state" as const };
    }

    const inviteRows = await client.query<{
      id: string;
      used_count: number;
      max_uses: number;
      revoked: boolean;
      expires_at: Date;
      invite_code_hash: string;
    }>(
      `select id, used_count, max_uses, revoked, expires_at, invite_code_hash
       from invite_tokens
       where token_id = $1 and deal_id = $2
       for update`,
      [payload.tokenId, deal.id]
    );

    if ((inviteRows.rowCount ?? 0) === 0) return { error: "invite_not_found" as const };
    const invite = inviteRows.rows[0];
    if (invite.revoked) return { error: "invite_revoked" as const };
    if (invite.expires_at.getTime() < Date.now()) return { error: "invite_expired" as const };
    if (invite.invite_code_hash.toLowerCase() !== payload.inviteCodeHash.toLowerCase()) {
      return { error: "invalid_invite_token" as const };
    }
    if (invite.used_count >= invite.max_uses) return { error: "invite_exhausted" as const };

    await client.query(
      `insert into deal_memberships (deal_id, participant_wallet, role)
       values ($1, $2, 'participant')
       on conflict (deal_id, participant_wallet) do nothing`,
      [deal.id, participantWallet]
    );

    await client.query(
      `update invite_tokens
       set used_count = used_count + 1,
           updated_at = now()
       where id = $1 and used_count < max_uses`,
      [invite.id]
    );

    await client.query(
      `update deals
       set current_participants = (
         select count(*)::int from deal_memberships where deal_id = $1
       ),
       updated_at = now()
       where id = $1`,
      [deal.id]
    );

    await client.query(
      `insert into audit_logs (actor_wallet, action, entity_type, entity_id, metadata)
       values ($1, 'join_deal', 'deal', $2, $3::jsonb)`,
      [
        participantWallet,
        dealAddress,
        JSON.stringify({
          tokenId: payload.tokenId
        })
      ]
    );

    return { ok: true as const };
  });

  if ("error" in result) {
    const statusByError: Record<string, number> = {
      deal_not_found: 404,
      invalid_state: 409,
      invite_not_found: 404,
      invite_revoked: 410,
      invite_expired: 410,
      invite_exhausted: 409,
      invalid_invite_token: 401
    };
    const errorCode = String(result.error);
    return NextResponse.json({ error: errorCode }, { status: statusByError[errorCode] ?? 400 });
  }

  return NextResponse.json({ ok: true });
}
