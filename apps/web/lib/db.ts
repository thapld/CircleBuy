import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __arcgroupPool: Pool | undefined;
}

function getPool() {
  if (global.__arcgroupPool) return global.__arcgroupPool;

  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000
  });

  if (process.env.NODE_ENV !== "production") {
    global.__arcgroupPool = pool;
  }

  return pool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
) {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function dbPing() {
  const rows = await query<QueryResultRow>("select 1 as ok");
  return rows[0]?.ok === 1;
}
