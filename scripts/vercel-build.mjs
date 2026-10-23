// Vercel build: accept either our own DATABASE_URL/DIRECT_URL or the variables the Supabase integration injects,
// run migrations against the direct (non-pooled) connection, then build.
import { execSync } from "node:child_process";

const env = { ...process.env };
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
env.DIRECT_URL ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;

const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx prisma generate");
if (env.DIRECT_URL) run("npx prisma migrate deploy");
else console.warn("[build] No database configured yet — skipping migrations. Connect Supabase in Vercel → Storage, then redeploy.");
run("npx next build");
