import { NextResponse } from "next/server";
import { dbPing } from "@/lib/db";

export async function GET() {
  const dbOk = await dbPing().catch(() => false);
  return NextResponse.json({
    ok: dbOk,
    service: "web",
    dbOk,
    now: new Date().toISOString()
  });
}
