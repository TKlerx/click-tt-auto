import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

it("preserves password hashes and external identities when aligning credential IDs", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE Account (id TEXT PRIMARY KEY, providerId TEXT, accountId TEXT, userId TEXT, password TEXT, UNIQUE(providerId, accountId));
      INSERT INTO Account VALUES ('legacy', 'credential', 'member@example.com', 'user-1', 'existing-hash'),
      ('current', 'credential', 'user-2', 'user-2', 'current-hash'),
      ('oauth', 'microsoft', 'external-id', 'user-1', NULL);`);
    const sql = readFileSync(
      "prisma/migrations-postgres/20261029000000_align_credential_account_ids/migration.sql",
      "utf8",
    );
    db.exec(sql);
    db.exec(sql);
    expect(
      db.prepare("SELECT accountId, password FROM Account ORDER BY id").all(),
    ).toEqual([
      { accountId: "user-2", password: "current-hash" },
      { accountId: "user-1", password: "existing-hash" },
      { accountId: "external-id", password: null },
    ]);
  } finally {
    db.close();
  }
});
