-- CreateEnum
CREATE TYPE "RasterWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "InputSetStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "RasterWishSource" AS ENUM ('PDF_PARSED', 'LLM_PASTED', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "RasterConfidence" AS ENUM ('OK', 'REVIEW');

-- CreateEnum
CREATE TYPE "HallCapacityBasis" AS ENUM ('REVIEWED', 'INFERRED', 'MISSING');

-- CreateEnum
CREATE TYPE "FixedRasterzahlSource" AS ENUM ('PDF', 'MANUAL', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "OptimizationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OptimizationRunOutcome" AS ENUM ('PROVEN_OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SnapshotOrigin" AS ENUM ('GENERATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "SnapshotOptimality" AS ENUM ('PROVEN_OPTIMAL', 'FEASIBLE', 'IMPORTED_HEURISTIC');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OPTIMIZED', 'FIXED', 'PINNED', 'MISSING');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('CONFLICT', 'CLUB_SUMMARY');

-- CreateEnum
CREATE TYPE "ReviewDecisionStatus" AS ENUM ('REVIEWED', 'NEEDS_CORRECTION', 'ACCEPTED_UNAVOIDABLE');

-- CreateTable
CREATE TABLE "RasterInputSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InputSetStatus" NOT NULL DEFAULT 'DRAFT',
    "seasonModelJson" TEXT,

    CONSTRAINT "RasterInputSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterWish" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "teamLabel" TEXT,
    "homeWeekday" "RasterWeekday" NOT NULL,
    "hall" TEXT,
    "startTime" TEXT,
    "spielwochePref" TEXT,
    "requestedRasterzahl" TEXT,
    "notes" TEXT,
    "source" "RasterWishSource" NOT NULL,
    "confidence" "RasterConfidence" NOT NULL DEFAULT 'REVIEW',

    CONSTRAINT "RasterWish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterHallCapacity" (
    "id" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "hall" TEXT NOT NULL,
    "weekday" "RasterWeekday" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "basis" "HallCapacityBasis" NOT NULL DEFAULT 'MISSING',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RasterHallCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterFixedRasterzahl" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamLabel" TEXT NOT NULL,
    "rasterzahl" INTEGER NOT NULL,
    "source" "FixedRasterzahlSource" NOT NULL,

    CONSTRAINT "RasterFixedRasterzahl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterOptimizationRun" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "OptimizationRunStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "OptimizationRunOutcome",
    "objectiveValue" DOUBLE PRECISION,
    "objectiveBreakdown" TEXT,
    "solverStatus" TEXT,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RasterOptimizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "district" TEXT NOT NULL,
    "origin" "SnapshotOrigin" NOT NULL,
    "optimality" "SnapshotOptimality" NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "totalConflicts" INTEGER NOT NULL DEFAULT 0,
    "totalExcess" INTEGER NOT NULL DEFAULT 0,
    "maxExcess" INTEGER NOT NULL DEFAULT 0,
    "affectedClubs" INTEGER NOT NULL DEFAULT 0,
    "objectiveBreakdown" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RasterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterAssignment" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "rasterzahl" INTEGER NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "weekday" "RasterWeekday" NOT NULL,
    "hall" TEXT NOT NULL,
    "startTime" TEXT,
    "weekSlot" TEXT,

    CONSTRAINT "RasterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterConflict" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "matchWeek" INTEGER NOT NULL,
    "clubId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "weekday" "RasterWeekday" NOT NULL,
    "hall" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "actualCount" INTEGER NOT NULL,
    "excess" INTEGER NOT NULL,
    "teams" TEXT NOT NULL,

    CONSTRAINT "RasterConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterReviewDecision" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "ReviewDecisionStatus" NOT NULL,
    "note" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RasterReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RasterInputSet_district_createdAt_idx" ON "RasterInputSet"("district", "createdAt");

-- CreateIndex
CREATE INDEX "RasterInputSet_createdById_idx" ON "RasterInputSet"("createdById");

-- CreateIndex
CREATE INDEX "RasterWish_inputSetId_idx" ON "RasterWish"("inputSetId");

-- CreateIndex
CREATE INDEX "RasterWish_clubId_idx" ON "RasterWish"("clubId");

-- CreateIndex
CREATE INDEX "RasterHallCapacity_district_clubId_idx" ON "RasterHallCapacity"("district", "clubId");

-- CreateIndex
CREATE INDEX "RasterHallCapacity_updatedById_idx" ON "RasterHallCapacity"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "RasterHallCapacity_district_clubId_hall_weekday_key" ON "RasterHallCapacity"("district", "clubId", "hall", "weekday");

-- CreateIndex
CREATE INDEX "RasterFixedRasterzahl_inputSetId_idx" ON "RasterFixedRasterzahl"("inputSetId");

-- CreateIndex
CREATE INDEX "RasterFixedRasterzahl_clubId_idx" ON "RasterFixedRasterzahl"("clubId");

-- CreateIndex
CREATE INDEX "RasterOptimizationRun_inputSetId_createdAt_idx" ON "RasterOptimizationRun"("inputSetId", "createdAt");

-- CreateIndex
CREATE INDEX "RasterOptimizationRun_startedById_idx" ON "RasterOptimizationRun"("startedById");

-- CreateIndex
CREATE INDEX "RasterOptimizationRun_status_createdAt_idx" ON "RasterOptimizationRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RasterSnapshot_runId_key" ON "RasterSnapshot"("runId");

-- CreateIndex
CREATE INDEX "RasterSnapshot_district_createdAt_idx" ON "RasterSnapshot"("district", "createdAt");

-- CreateIndex
CREATE INDEX "RasterSnapshot_stale_idx" ON "RasterSnapshot"("stale");

-- CreateIndex
CREATE INDEX "RasterAssignment_snapshotId_clubId_idx" ON "RasterAssignment"("snapshotId", "clubId");

-- CreateIndex
CREATE INDEX "RasterAssignment_snapshotId_league_group_idx" ON "RasterAssignment"("snapshotId", "league", "group");

-- CreateIndex
CREATE INDEX "RasterConflict_snapshotId_clubId_idx" ON "RasterConflict"("snapshotId", "clubId");

-- CreateIndex
CREATE INDEX "RasterConflict_snapshotId_excess_idx" ON "RasterConflict"("snapshotId", "excess");

-- CreateIndex
CREATE INDEX "RasterReviewDecision_snapshotId_targetType_targetId_idx" ON "RasterReviewDecision"("snapshotId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "RasterReviewDecision_decidedById_idx" ON "RasterReviewDecision"("decidedById");

-- AddForeignKey
ALTER TABLE "RasterInputSet" ADD CONSTRAINT "RasterInputSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterWish" ADD CONSTRAINT "RasterWish_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterHallCapacity" ADD CONSTRAINT "RasterHallCapacity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterFixedRasterzahl" ADD CONSTRAINT "RasterFixedRasterzahl_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterOptimizationRun" ADD CONSTRAINT "RasterOptimizationRun_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterOptimizationRun" ADD CONSTRAINT "RasterOptimizationRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterSnapshot" ADD CONSTRAINT "RasterSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RasterOptimizationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterAssignment" ADD CONSTRAINT "RasterAssignment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RasterSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterConflict" ADD CONSTRAINT "RasterConflict_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RasterSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterReviewDecision" ADD CONSTRAINT "RasterReviewDecision_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RasterSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterReviewDecision" ADD CONSTRAINT "RasterReviewDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
