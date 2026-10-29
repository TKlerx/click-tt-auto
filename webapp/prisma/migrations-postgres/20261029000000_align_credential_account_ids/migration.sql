-- Better Auth 1.7 identifies password accounts by user ID. Preserve hashes and OAuth identities.
UPDATE "Account" SET "accountId" = "userId"
WHERE "providerId" = 'credential' AND "accountId" <> "userId";
