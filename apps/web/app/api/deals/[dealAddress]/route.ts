import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const paramsSchema = z.object({
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ dealAddress: string }> }
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedParams.error.flatten() },
      { status: 400 }
    );
  }

  const { dealAddress } = parsedParams.data;

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
      created_at as "createdAt",
      updated_at as "updatedAt"
    from deals
    where deal_address = $1
    limit 1`,
    [dealAddress]
  );

  if (deals.length === 0) {
    return NextResponse.json({ error: "deal_not_found" }, { status: 404 });
  }

  const memberships = await query(
    `select
      participant_wallet as "participantWallet",
      role,
      joined_at as "joinedAt"
    from deal_memberships
    where deal_id = $1
    order by joined_at asc`,
    [deals[0].id]
  );

  return NextResponse.json({
    deal: deals[0],
    memberships
  });
}
