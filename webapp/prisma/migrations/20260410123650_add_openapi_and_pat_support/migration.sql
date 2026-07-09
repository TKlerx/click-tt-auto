-- SQLite stores Prisma enums as text, so no physical schema change is required.
-- This migration records the introduction of TokenType, TokenStatus, and the
-- new AuditAction values used for PAT and CLI login flows.

-- CreateTable
CREATE TABLE "PersonalAccessToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" DATETIME,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CliAuthCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "userId" TEXT,
    "exchanged" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CliAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_tokenHash_idx" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_userId_status_idx" ON "PersonalAccessToken"("userId", "status");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_status_expiresAt_idx" ON "PersonalAccessToken"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_userId_name_key" ON "PersonalAccessToken"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CliAuthCode_code_key" ON "CliAuthCode"("code");

-- CreateIndex
CREATE INDEX "CliAuthCode_code_idx" ON "CliAuthCode"("code");

-- CreateIndex
CREATE INDEX "CliAuthCode_expiresAt_idx" ON "CliAuthCode"("expiresAt");
