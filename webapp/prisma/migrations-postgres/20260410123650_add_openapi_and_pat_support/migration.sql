DO $$
BEGIN
  CREATE TYPE "TokenType" AS ENUM ('PAT', 'CLI_LOGIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAT_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAT_RENEWED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLI_LOGIN_COMPLETED';

CREATE TABLE "PersonalAccessToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CliAuthCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "userId" TEXT,
    "exchanged" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CliAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");
CREATE INDEX "PersonalAccessToken_tokenHash_idx" ON "PersonalAccessToken"("tokenHash");
CREATE INDEX "PersonalAccessToken_userId_status_idx" ON "PersonalAccessToken"("userId", "status");
CREATE INDEX "PersonalAccessToken_status_expiresAt_idx" ON "PersonalAccessToken"("status", "expiresAt");
CREATE UNIQUE INDEX "PersonalAccessToken_userId_name_key" ON "PersonalAccessToken"("userId", "name");

CREATE UNIQUE INDEX "CliAuthCode_code_key" ON "CliAuthCode"("code");
CREATE INDEX "CliAuthCode_code_idx" ON "CliAuthCode"("code");
CREATE INDEX "CliAuthCode_expiresAt_idx" ON "CliAuthCode"("expiresAt");

ALTER TABLE "PersonalAccessToken"
ADD CONSTRAINT "PersonalAccessToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CliAuthCode"
ADD CONSTRAINT "CliAuthCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
