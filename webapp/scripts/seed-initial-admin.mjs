import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

function validatePasswordComplexity(password) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function createId() {
  return randomUUID();
}

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const databaseUrl =
    process.env.MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL;

  if (!email || !password) {
    throw new Error(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set",
    );
  }

  if (!databaseUrl) {
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL must be set");
  }

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

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    const existingUsers = await client.query('select count(*) from "User"');
    if (Number(existingUsers.rows[0].count) > 0) {
      const existingAdmins = await client.query(
        'select count(*) from "User" where "role" = $1',
        ["PLATFORM_ADMIN"],
      );
      if (Number(existingAdmins.rows[0].count) === 0) {
        throw new Error(
          "Expected at least one admin user in the starter database.",
        );
      }

      console.log("Skipping initial admin seed because users already exist.");
      await client.query("commit");
      return;
    }

    const now = new Date();
    const userId = createId();
    const accountId = createId();
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query(
      `insert into "User" (
        "id",
        "email",
        "emailVerified",
        "name",
        "role",
        "status",
        "authMethod",
        "mustChangePassword",
        "themePreference",
        "locale",
        "createdAt",
        "updatedAt"
      ) values ($1, $2, true, $3, $4, $5, $6, true, $7, $8, $9, $9)`,
      [
        userId,
        email,
        "Initial Admin",
        "PLATFORM_ADMIN",
        "ACTIVE",
        "LOCAL",
        "LIGHT",
        "en",
        now,
      ],
    );

    await client.query(
      `insert into "Account" (
        "id",
        "accountId",
        "providerId",
        "userId",
        "password",
        "createdAt",
        "updatedAt"
      ) values ($1, $2, $3, $4, $5, $6, $6)`,
      [accountId, email, "credential", userId, passwordHash, now],
    );

    await client.query("commit");
    console.log(`Seeded initial admin user ${email}.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
