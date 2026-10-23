import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DATABASE_URL (ours) or POSTGRES_PRISMA_URL (injected by the Supabase ↔ Vercel integration, pooled).
const datasourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || undefined;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
