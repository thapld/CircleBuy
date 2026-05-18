import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ARC_RPC_URL: z.string().url().default("https://rpc.testnet.arc.network"),
  ARC_CHAIN_ID: z.coerce.number().int().positive().default(5042002),
  ESCROW_FACTORY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  INVITE_SIGNING_SECRET: z.string().min(16).optional()
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    ARC_RPC_URL: process.env.ARC_RPC_URL,
    ARC_CHAIN_ID: process.env.ARC_CHAIN_ID,
    ESCROW_FACTORY_ADDRESS: process.env.ESCROW_FACTORY_ADDRESS,
    INVITE_SIGNING_SECRET: process.env.INVITE_SIGNING_SECRET
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function requireInviteSigningSecret(): string {
  const secret = getEnv().INVITE_SIGNING_SECRET;
  if (!secret) {
    throw new Error("INVITE_SIGNING_SECRET is required for invite operations");
  }
  return secret;
}
