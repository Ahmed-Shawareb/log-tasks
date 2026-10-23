import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Every run gets its own throw-away database (log_test_<timestamp>) that is created, migrated and seeded here
 * and dropped in teardown. No existing database — dev or otherwise — is ever reset or modified.
 */
export default async function setup() {
  const base = process.env.TEST_DATABASE_SERVER ?? "postgresql://log:log_local_dev@localhost:5433";
  const name = `log_test_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: `${base}/postgres` });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const url = `${base}/${name}`;
  process.env.DATABASE_URL = url; // inherited by the test workers
  process.env.DIRECT_URL = url;

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, APP_ENV: "test", PRISMA_HIDE_UPDATE_MESSAGE: "1" } as NodeJS.ProcessEnv;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env });

  return async () => {
    // Only the database created above, a few seconds ago, is removed.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
