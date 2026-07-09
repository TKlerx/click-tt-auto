INSERT INTO "Account" (
    "id",
    "accountId",
    "providerId",
    "userId",
    "password",
    "createdAt",
    "updatedAt"
)
SELECT
    'backfill_' || "id",
    lower("email"),
    'credential',
    "id",
    "passwordHash",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "passwordHash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Account"
    WHERE "Account"."providerId" = 'credential'
      AND "Account"."accountId" = lower("User"."email")
  );

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SCOPE_USER',
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "authMethod" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "themePreference" TEXT NOT NULL DEFAULT 'LIGHT',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_User" (
    "id",
    "email",
    "emailVerified",
    "name",
    "image",
    "role",
    "status",
    "authMethod",
    "mustChangePassword",
    "themePreference",
    "locale",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "email",
    "emailVerified",
    "name",
    "image",
    "role",
    "status",
    "authMethod",
    "mustChangePassword",
    "themePreference",
    "locale",
    "createdAt",
    "updatedAt"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

PRAGMA foreign_keys=ON;
