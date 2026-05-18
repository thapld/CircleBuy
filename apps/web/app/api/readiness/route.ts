import { NextResponse } from "next/server";
import { dbPing } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    const env = getEnv();
    const dbOk = await dbPing();
    if (!dbOk) {
      return NextResponse.json({ ok: false, reason: "db_unreachable" }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      env: {
        chainId: env.ARC_CHAIN_ID,
        hasFactoryAddress: Boolean(env.ESCROW_FACTORY_ADDRESS),
        hasInviteSecret: Boolean(env.INVITE_SIGNING_SECRET)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: "boot_error", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 }
    );
  }
}
