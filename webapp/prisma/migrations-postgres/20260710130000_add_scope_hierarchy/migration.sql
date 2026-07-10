ALTER TABLE "Scope" ADD COLUMN "parentId" TEXT;

CREATE INDEX "Scope_parentId_idx" ON "Scope"("parentId");

ALTER TABLE "Scope" ADD CONSTRAINT "Scope_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Scope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
