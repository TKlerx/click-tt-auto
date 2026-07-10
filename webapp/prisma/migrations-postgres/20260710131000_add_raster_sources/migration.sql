CREATE TABLE "RasterSource" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "contentHash" TEXT,
    "parsedJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RasterSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RasterSource_scopeId_sourceType_idx" ON "RasterSource"("scopeId", "sourceType");

CREATE UNIQUE INDEX "RasterSource_scopeId_sourceType_sourceRef_key" ON "RasterSource"("scopeId", "sourceType", "sourceRef");

ALTER TABLE "RasterSource" ADD CONSTRAINT "RasterSource_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
