import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1)
});

const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationDir = path.resolve(__dirname, "../../../supabase/migrations");

async function run() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = await pool.query<{ id: string }>(
      "select id from schema_migrations where id = $1 limit 1",
      [file]
    );

    if ((already.rowCount ?? 0) > 0) {
      continue;
    }

    const sqlPath = path.join(migrationDir, file);
    const sql = await readFile(sqlPath, "utf-8");

    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (id) values ($1)", [file]);
      await pool.query("commit");
      // eslint-disable-next-line no-console
      console.log(`applied migration: ${file}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }

  await pool.end();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
