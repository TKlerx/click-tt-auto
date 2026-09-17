CREATE TYPE "RasterManualBaselineStatus" AS ENUM ('IMPORTING', 'REVIEW', 'READY', 'FAILED');
CREATE TYPE "RasterManualBaselineRowStatus" AS ENUM ('MATCHED', 'REVIEW', 'IGNORED', 'ACCEPTED_UNRESOLVED', 'INVALID');

CREATE TABLE "RasterManualBaseline" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "status" "RasterManualBaselineStatus" NOT NULL DEFAULT 'IMPORTING',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sourceSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "errorJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "RasterManualBaseline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RasterManualBaselineRow" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "sourceIdentityKey" TEXT NOT NULL,
    "sourceGroupLabel" TEXT NOT NULL,
    "sourceTeamLabel" TEXT NOT NULL,
    "rasterzahl" INTEGER NOT NULL,
    "sourceLocation" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RasterManualBaselineRowStatus" NOT NULL,
    "targetTeamId" TEXT,
    "targetTeamLabel" TEXT,
    "issue" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "RasterManualBaselineRow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RasterOptimizationRun" ADD COLUMN "baselineId" TEXT;

CREATE INDEX "RasterManualBaseline_inputSetId_createdAt_idx" ON "RasterManualBaseline"("inputSetId", "createdAt");
CREATE INDEX "RasterManualBaseline_startedById_idx" ON "RasterManualBaseline"("startedById");
CREATE INDEX "RasterManualBaseline_inputSetId_active_idx" ON "RasterManualBaseline"("inputSetId", "active");
CREATE INDEX "RasterManualBaseline_inputSetId_status_idx" ON "RasterManualBaseline"("inputSetId", "status");
CREATE UNIQUE INDEX "RasterManualBaseline_active_key" ON "RasterManualBaseline"("inputSetId") WHERE "active" = true;
CREATE UNIQUE INDEX "RasterManualBaseline_importing_key" ON "RasterManualBaseline"("inputSetId") WHERE "status" = 'IMPORTING';
CREATE UNIQUE INDEX "RasterManualBaselineRow_baselineId_sourceIdentityKey_key" ON "RasterManualBaselineRow"("baselineId", "sourceIdentityKey");
CREATE INDEX "RasterManualBaselineRow_baselineId_status_idx" ON "RasterManualBaselineRow"("baselineId", "status");
CREATE INDEX "RasterManualBaselineRow_reviewedById_idx" ON "RasterManualBaselineRow"("reviewedById");
CREATE INDEX "RasterManualBaselineRow_targetTeamId_idx" ON "RasterManualBaselineRow"("targetTeamId");
CREATE INDEX "RasterOptimizationRun_baselineId_idx" ON "RasterOptimizationRun"("baselineId");

ALTER TABLE "RasterManualBaseline" ADD CONSTRAINT "RasterManualBaseline_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterManualBaseline" ADD CONSTRAINT "RasterManualBaseline_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RasterManualBaselineRow" ADD CONSTRAINT "RasterManualBaselineRow_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "RasterManualBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterManualBaselineRow" ADD CONSTRAINT "RasterManualBaselineRow_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RasterOptimizationRun" ADD CONSTRAINT "RasterOptimizationRun_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "RasterManualBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
