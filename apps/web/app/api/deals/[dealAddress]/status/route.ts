import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";

const paramsSchema = z.object({
  dealAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

const statusSchema = z.object({
  organizerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  action: z.enum(["complete", "cancel", "force_refunding"]),
  reason: z.string().max(180).optional()
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
  const parsedBody = statusSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const { dealAddress } = parsedParams.data;
  const { organizerWallet, action, reason } = parsedBody.data;

  const result = await withTransaction(async (client) => {
    const rows = await client.query<{ id: string; status: string; organizer_wallet: string }>(
      `select id, status, organizer_wallet
       from deals
       where deal_address = $1
       limit 1
       for update`,
      [dealAddress]
    );
    if ((rows.rowCount ?? 0) === 0) return { error: "deal_not_found" as const };
    const deal = rows.rows[0];

    if (deal.organizer_wallet.toLowerCase() !== organizerWallet.toLowerCase()) {
      return { error: "unauthorized" as const };
    }

    let nextStatus: string | null = null;
    if (action === "cancel") {
      if (deal.status === "completed") return { error: "invalid_state" as const };
      nextStatus = "cancelled";
    }
    if (action === "force_refunding") {
      if (deal.status === "completed") return { error: "invalid_state" as const };
      nextStatus = "refunding";
    }
    if (action === "complete") {
      if (deal.status !== "ready_to_order") return { error: "invalid_state" as const };
      nextStatus = "completed";
    }

    await client.query(
      `update deals
       set status = $1,
           status_reason = $2,
           updated_at = now()
       where id = $3`,
      [nextStatus, reason ?? action, deal.id]
    );

    await client.query(
      `insert into audit_logs (actor_wallet, action, entity_type, entity_id, metadata)
       values ($1, $2, 'deal', $3, $4::jsonb)`,
      [
        organizerWallet,
        "organizer_status_change",
        dealAddress,
        JSON.stringify({ action, reason: reason ?? null, nextStatus })
      ]
    );

    return { ok: true as const, nextStatus };
  });

  if ("error" in result) {
    const statusByError: Record<string, number> = {
      deal_not_found: 404,
      unauthorized: 403,
      invalid_state: 409
    };
    const errorCode = String(result.error);
    return NextResponse.json({ error: errorCode }, { status: statusByError[errorCode] ?? 400 });
  }

  return NextResponse.json({ ok: true, status: result.nextStatus });
}
