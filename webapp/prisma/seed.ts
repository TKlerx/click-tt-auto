import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SqlDriverAdapterFactory } from "@prisma/client/runtime/client";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../generated/prisma/enums";
import { validatePasswordComplexity } from "../src/lib/auth";
import { normalizeInitialAdminEmail } from "./seed-utils";

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

const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "file:./dev.db";
const adapter = createAdapter(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  const rawEmail = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set",
    );
  }
  const email = normalizeInitialAdminEmail(rawEmail);

  if (!validatePasswordComplexity(password)) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD does not meet the required password complexity policy.",
    );
  }

  if (process.env.NODE_ENV === "production" && password === "ChangeMe123!") {
    throw new Error(
      "FATAL: INITIAL_ADMIN_PASSWORD is still set to the default development value in production.",
    );
  }

  const existingCount = await prisma.user.count();

  if (existingCount > 0) {
    const admin = await prisma.user.findFirst({
      where: { role: Role.PLATFORM_ADMIN },
    });

    if (!admin) {
      throw new Error(
        "Expected at least one admin user in the starter database.",
      );
    }

    console.log("Skipping seed because users already exist.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email,
      emailVerified: true,
      name: "Initial Admin",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.LOCAL,
      mustChangePassword: true,
      themePreference: ThemePreference.LIGHT,
      locale: "en",
      accounts: {
        create: {
          providerId: "credential",
          accountId: email,
          password: passwordHash,
        },
      },
    },
  });

  console.log(`Seeded initial admin user ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
