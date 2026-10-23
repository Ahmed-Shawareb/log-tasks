// Local development PostgreSQL (real Postgres binaries from npm — no Docker / install needed).
// Data persists in ./.pgdata between restarts. Production uses Supabase PostgreSQL instead.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, ".pgdata");
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "log",
  password: "log_local_dev",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
for (const name of ["log_dev", "log_test"]) {
  try { await pg.createDatabase(name); } catch { /* already exists */ }
}
console.log(`[db] PostgreSQL ready on postgresql://log:***@localhost:${port} (databases: log_dev, log_test)`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (process.argv.includes("--once")) await stop();
