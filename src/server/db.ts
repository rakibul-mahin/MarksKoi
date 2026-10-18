import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { buildPoolConfig } from "./db-config";
import { getDatabaseUrl } from "./env";

/**
 * Single Prisma client per server instance. In development the instance is cached on globalThis
 * so hot reloads don't exhaust connections. Serverless functions keep the pool small because the
 * Supabase transaction pooler multiplexes connections.
 */
function createClient() {
  const adapter = new PrismaPg({
    ...buildPoolConfig(getDatabaseUrl(), process.env.DATABASE_CA_CERT),
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

type Client = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { __syncscorePrisma?: Client };

export const db: Client = globalForPrisma.__syncscorePrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__syncscorePrisma = db;

export type Db = Client;
export type Tx = Parameters<Parameters<Client["$transaction"]>[0]>[0];
