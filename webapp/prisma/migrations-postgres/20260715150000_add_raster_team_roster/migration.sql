CREATE TYPE "RosterCharset" AS ENUM ('UTF8', 'ISO_8859_15');

CREATE TABLE "RasterTeamRoster" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "sourceRegion" TEXT NOT NULL,
    "sourceSeason" TEXT NOT NULL,
    "charset" "RosterCharset" NOT NULL,
    "importedById" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RasterTeamRoster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RasterRosterTeam" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "vereinNr" TEXT NOT NULL,
    "vereinName" TEXT NOT NULL,
    "altersklasse" TEXT NOT NULL,
    "mannschaftNr" TEXT NOT NULL,
    "liga" TEXT NOT NULL,
    "gruppe" TEXT NOT NULL,

    CONSTRAINT "RasterRosterTeam_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RasterTeamRoster_scopeId_season_importedAt_idx" ON "RasterTeamRoster"("scopeId", "season", "importedAt");
CREATE UNIQUE INDEX "RasterRosterTeam_rosterId_vereinNr_altersklasse_mannschaftNr_key" ON "RasterRosterTeam"("rosterId", "vereinNr", "altersklasse", "mannschaftNr");
CREATE INDEX "RasterRosterTeam_rosterId_vereinNr_idx" ON "RasterRosterTeam"("rosterId", "vereinNr");
CREATE INDEX "RasterRosterTeam_rosterId_gruppe_idx" ON "RasterRosterTeam"("rosterId", "gruppe");

ALTER TABLE "RasterTeamRoster" ADD CONSTRAINT "RasterTeamRoster_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RasterTeamRoster" ADD CONSTRAINT "RasterTeamRoster_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RasterRosterTeam" ADD CONSTRAINT "RasterRosterTeam_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "RasterTeamRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
