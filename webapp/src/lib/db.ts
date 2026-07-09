import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SqlDriverAdapterFactory } from "@prisma/client/runtime/client";
import { PrismaClient } from "../../generated/prisma/client";
import { resolveAppDatabaseUrl } from "@/lib/database-url";

const require = createRequire(import.meta.url);

function createAdapter(connectionString: string) {
  if (connectionString.startsWith("file:")) {
    const { PrismaBetterSqlite3 } =
      require("@prisma/adapter-better-sqlite3") as {
        PrismaBetterSqlite3: new (options: {
          url: string;
        }) => SqlDriverAdapterFactory;
      };

    return new PrismaBetterSqlite3({ url: connectionString });
  }

  return new PrismaPg(
    { connectionString },
    { schema: getPostgresSchema(connectionString) },
  );
}

function getPostgresSchema(connectionString: string) {
  return new URL(connectionString).searchParams.get("schema") ?? undefined;
}

function createPrismaClient() {
  return new PrismaClient({ adapter });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  var prisma: AppPrismaClient | undefined;
}

const connectionString = resolveAppDatabaseUrl();
const adapter = createAdapter(connectionString);

export const prisma: AppPrismaClient =
  globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
