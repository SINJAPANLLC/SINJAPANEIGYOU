import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL, ensure the database is provisioned");

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(packageDirectory, "migrations");
const migrationFiles = (await fs.readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

let client = new pg.Client({ connectionString });
await client.connect();

const schemaExists = await client.query(
  "SELECT to_regclass('public.assistant_reports') IS NOT NULL AS exists",
);
if (!schemaExists.rows[0]?.exists) {
  await client.end();
  const bootstrap = spawnSync("pnpm", ["run", "push"], {
    cwd: packageDirectory,
    env: process.env,
    stdio: "inherit",
  });
  if (bootstrap.status !== 0) {
    throw new Error(`Fresh database bootstrap failed with exit code ${bootstrap.status ?? "unknown"}`);
  }
  client = new pg.Client({ connectionString });
  await client.connect();
}

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_workspace_schema_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of migrationFiles) {
    const existing = await client.query(
      'SELECT 1 FROM "_workspace_schema_migrations" WHERE "name" = $1',
      [file],
    );
    if (existing.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO "_workspace_schema_migrations" ("name") VALUES ($1)',
        [file],
      );
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}