CREATE TABLE "RasterManualAssignmentDraft" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rowsJson" TEXT NOT NULL,
    "validationIssuesJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RasterManualAssignmentDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RasterManualAssignmentDraft_inputSetId_updatedAt_idx" ON "RasterManualAssignmentDraft"("inputSetId", "updatedAt");
CREATE INDEX "RasterManualAssignmentDraft_createdById_idx" ON "RasterManualAssignmentDraft"("createdById");

ALTER TABLE "RasterManualAssignmentDraft"
ADD CONSTRAINT "RasterManualAssignmentDraft_inputSetId_fkey"
FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RasterManualAssignmentDraft"
ADD CONSTRAINT "RasterManualAssignmentDraft_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
