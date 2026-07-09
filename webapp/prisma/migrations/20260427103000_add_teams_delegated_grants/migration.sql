-- CreateTable
CREATE TABLE "TeamsDelegatedGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamsDelegatedGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamsDelegatedGrant_userId_key" ON "TeamsDelegatedGrant"("userId");

-- CreateIndex
CREATE INDEX "TeamsDelegatedGrant_expiresAt_idx" ON "TeamsDelegatedGrant"("expiresAt");
