import crypto from "node:crypto";
import { keccak256, toHex } from "viem";
import type { InviteTokenPayload } from "@arcgroup/shared";

const TOKEN_VERSION = 1;

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hashInviteCode(inviteCode: string): string {
  return keccak256(toHex(inviteCode));
}

export function createInviteToken(params: {
  dealAddress: string;
  inviteCodeHash: string;
  maxUses: number;
  expiresAt: Date;
  secret: string;
}): { token: string; payload: InviteTokenPayload } {
  const payload: InviteTokenPayload = {
    tokenId: crypto.randomUUID(),
    dealAddress: params.dealAddress,
    inviteCodeHash: params.inviteCodeHash,
    exp: Math.floor(params.expiresAt.getTime() / 1000),
    nonce: crypto.randomBytes(12).toString("hex"),
    maxUses: params.maxUses
  };

  const encoded = base64urlEncode(JSON.stringify({ v: TOKEN_VERSION, ...payload }));
  const signature = sign(encoded, params.secret);
  return {
    token: `${encoded}.${signature}`,
    payload
  };
}

export function verifyInviteToken(token: string, secret: string): InviteTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = sign(encoded, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64urlDecode(encoded)) as InviteTokenPayload & { v?: number };
    if (parsed.v !== TOKEN_VERSION) return null;
    if (!parsed.tokenId || !parsed.dealAddress || !parsed.inviteCodeHash || !parsed.exp) {
      return null;
    }
    if (!Number.isInteger(parsed.exp) || parsed.exp <= 0) return null;
    if (!Number.isInteger(parsed.maxUses) || parsed.maxUses <= 0) return null;

    return {
      tokenId: parsed.tokenId,
      dealAddress: parsed.dealAddress,
      inviteCodeHash: parsed.inviteCodeHash,
      exp: parsed.exp,
      nonce: parsed.nonce,
      maxUses: parsed.maxUses
    };
  } catch {
    return null;
  }
}
