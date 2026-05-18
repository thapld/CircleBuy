import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireInviteSigningSecret } from "@/lib/env";
import { verifyInviteToken } from "@/lib/invite";

const verifyInviteSchema = z.object({
  inviteToken: z.string().min(32),
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = verifyInviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { inviteToken, dealAddress } = parsed.data;
  const payload = verifyInviteToken(inviteToken, requireInviteSigningSecret());

  if (!payload) {
    return NextResponse.json({ error: "invalid_invite_token" }, { status: 401 });
  }
  if (payload.exp * 1000 < Date.now()) {
    return NextResponse.json({ error: "invite_expired" }, { status: 410 });
  }
  if (dealAddress && payload.dealAddress.toLowerCase() !== dealAddress.toLowerCase()) {
    return NextResponse.json({ error: "invalid_invite_token" }, { status: 401 });
  }

  const deals = await query<{ dealAddress: string; title: string; status: string }>(
    `select
      deal_address as "dealAddress",
      title,
      status
     from deals
     where deal_address = $1
     limit 1`,
    [payload.dealAddress]
  );

  if (deals.length === 0) {
    return NextResponse.json({ error: "deal_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    payload,
    deal: deals[0]
  });
}
