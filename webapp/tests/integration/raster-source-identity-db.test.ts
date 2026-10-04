import { afterAll, describe, expect, it } from "vitest";

// Context: real PostgreSQL migration/service integration, opt-in isolated database only.
// Goal: prove scope/season reuse, conservative review, admin provenance and workspace isolation.
const enabled = process.env.ALIAS_ISOLATED_DB_TEST === "1";
describe.skipIf(!enabled)(
  "persisted source identity aliases on isolated PostgreSQL",
  () => {
    let db: typeof import("@/lib/db").prisma;
    const scopeId = "alias-integration-scope";
    const otherScopeId = "alias-integration-other-scope";
    afterAll(async () => {
      if (!db) return;
      await db.rasterInputSet.deleteMany({
        where: { scopeId: { in: [scopeId, otherScopeId] } },
      });
      await db.rasterHallCapacity.deleteMany({
        where: { scopeId: { in: [scopeId, otherScopeId] } },
      });
      await db.scope.deleteMany({
        where: { id: { in: [scopeId, otherScopeId] } },
      });
      await db.user.deleteMany({ where: { id: "alias-integration-user" } });
      await db.$disconnect();
    });
    it("persists exact/fuzzy/ambiguous matches and reuses reviewed club/team aliases across workspaces", async () => {
      db = (await import("@/lib/db")).prisma;
      const {
        resolveSourceIdentityAlias,
        reviewSourceIdentityAlias,
        unresolvedSourceIdentityAliases,
      } = await import("@/services/raster/sourceIdentityAliases");
      await db.scope.createMany({
        data: [
          { id: scopeId, code: "ALIAS_TEST", name: "Alias test" },
          {
            id: otherScopeId,
            code: "ALIAS_OTHER_TEST",
            name: "Other alias test",
          },
        ],
      });
      await db.user.create({
        data: {
          id: "alias-integration-user",
          name: "Test admin",
          email: "alias-integration@example.invalid",
          authMethod: "LOCAL",
        },
      });
      const model = {
        clubs: [
          { id: "gw", name: "SC Grün-Weiß Paderborn" },
          { id: "ttv", name: "TTV Example" },
        ],
        teams: [{ id: "gw-1", clubId: "gw", label: "Herren I" }],
        sourceIdentityReferences: [
          { kind: "CLUB", normalizedSourceName: "scgwpaderborn" },
          { kind: "TEAM", normalizedSourceName: "scgrunweisspaderbornherren1" },
          { kind: "CLUB", normalizedSourceName: "newclub" },
        ],
      };
      for (const id of [
        "alias-workspace-a",
        "alias-workspace-b",
        "alias-workspace-unrelated",
      ]) {
        await db.rasterInputSet.create({
          data: {
            id,
            name: id,
            scopeId,
            season: "2026/27",
            createdById: "alias-integration-user",
            seasonModelJson: JSON.stringify(
              id.endsWith("unrelated") ? {} : model,
            ),
          },
        });
      }
      const base = {
        scopeId,
        season: "2026/27",
        kind: "CLUB" as const,
        canonicalCandidates: model.clubs,
      };
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          rawIdentity: "TTV Example e.V.",
        }),
      ).toMatchObject({ state: "confirmed", canonicalIdentity: "ttv" });
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          rawIdentity: "SC GW Paderborn",
        }),
      ).toEqual({ state: "pending" });
      expect(
        await unresolvedSourceIdentityAliases("alias-workspace-a"),
      ).toHaveLength(1);
      expect(
        await unresolvedSourceIdentityAliases("alias-workspace-unrelated"),
      ).toEqual([]);
      expect(
        await reviewSourceIdentityAlias({
          inputSetId: "alias-workspace-a",
          kind: "CLUB",
          rawIdentity: "SC GW Paderborn",
          targetIdentity: "gw",
          createNewIdentity: false,
        }),
      ).not.toBeNull();
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          rawIdentity: "SC GW Paderborn",
        }),
      ).toMatchObject({ state: "confirmed", canonicalIdentity: "gw" });
      expect(
        await unresolvedSourceIdentityAliases("alias-workspace-b"),
      ).toEqual([]);
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          season: "2027/28",
          rawIdentity: "SC GW Paderborn",
        }),
      ).toEqual({ state: "pending" });
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          scopeId: otherScopeId,
          rawIdentity: "SC GW Paderborn",
        }),
      ).toEqual({ state: "pending" });
      expect(
        await resolveSourceIdentityAlias({
          ...base,
          rawIdentity: "Duplicate",
          canonicalCandidates: [
            { id: "a", name: "Duplicate" },
            { id: "b", name: "Duplicate" },
          ],
        }),
      ).toEqual({ state: "pending" });
      expect(
        await db.rasterSourceIdentityAlias.findFirst({
          where: { scopeId, rawSourceName: "Duplicate" },
        }),
      ).toMatchObject({ canonicalIdentity: null, reviewState: "PENDING" });
      const teamRaw = "SC Grün-Weiß Paderborn :: Herren 1";
      await resolveSourceIdentityAlias({
        ...base,
        kind: "TEAM",
        rawIdentity: teamRaw,
        canonicalCandidates: [
          { id: "gw-1", name: "SC Grün-Weiß Paderborn :: Herren I" },
        ],
      });
      expect(
        await reviewSourceIdentityAlias({
          inputSetId: "alias-workspace-a",
          kind: "TEAM",
          rawIdentity: teamRaw,
          targetIdentity: "gw-1",
          createNewIdentity: false,
        }),
      ).not.toBeNull();
      expect(
        await reviewSourceIdentityAlias({
          inputSetId: "alias-workspace-unrelated",
          kind: "TEAM",
          rawIdentity: teamRaw,
          targetIdentity: "gw-1",
          createNewIdentity: false,
        }),
      ).toBeNull();
      expect(
        await reviewSourceIdentityAlias({
          inputSetId: "alias-workspace-a",
          kind: "TEAM",
          rawIdentity: teamRaw,
          targetIdentity: "not-in-workspace",
          createNewIdentity: false,
        }),
      ).toBeNull();
      expect(
        await db.rasterSourceIdentityAlias.findFirst({
          where: { scopeId, kind: "TEAM", rawSourceName: teamRaw },
        }),
      ).toMatchObject({
        reviewState: "CONFIRMED",
        matchConfidence: "MANUAL",
        source: "admin-review",
        canonicalIdentity: "gw-1",
      });
      expect(
        await reviewSourceIdentityAlias({
          inputSetId: "alias-workspace-a",
          kind: "CLUB",
          rawIdentity: "New club",
          createNewIdentity: true,
        }),
      ).not.toBeNull();
      expect(
        await db.rasterSourceIdentityAlias.findFirst({
          where: { scopeId, rawSourceName: "New club" },
        }),
      ).toMatchObject({
        reviewState: "CONFIRMED",
        matchConfidence: "CREATED",
        source: "admin-review",
      });
    }, 120_000);
    it("projects confirmed club/team identities into wishes and capacities on repeated real cache sync", async () => {
      const { syncInputSetSourceCaches, validateInputSet } =
        await import("@/services/raster/inputSets");
      const { inferHallCapacitiesFromInputSet } =
        await import("@/services/raster/capacity");
      const { reviewSourceIdentityAlias, unresolvedSourceIdentityAliases } =
        await import("@/services/raster/sourceIdentityAliases");
      const workspace = await db.rasterInputSet.create({
        data: {
          name: "Real cache alias test",
          scopeId,
          season: "2026/27",
          createdById: "alias-integration-user",
        },
      });
      const assignments = [1, 2, 3, 4, 5].map((rasterzahl) => ({
        league: "L",
        group: "1. Bezirksklasse Erwachsene",
        rasterzahl,
        team:
          rasterzahl === 1
            ? "SC Grün-Weiß Paderborn"
            : `Other Club ${rasterzahl}`,
        sourceUrl: "https://example.invalid",
      }));
      const wishes = {
        clubs: [{ id: "sc-gw-paderborn", name: "SC GW Paderborn" }],
        teams: [
          {
            clubId: "sc-gw-paderborn",
            label: "Erwachsene I",
            homeWeekday: "friday",
            hall: "1",
            startTime: "20:00",
            rasterzahl: { kind: "assignable" },
            confidence: "ok",
          },
        ],
        warnings: [],
      };
      await db.rasterSource.createMany({
        data: [
          {
            scopeId,
            season: "2026/27",
            inputSetId: workspace.id,
            sourceType: "GROUP_ASSIGNMENT",
            sourceRef: "alias-real-groups",
            parsedJson: JSON.stringify({ assignments }),
            displayName: "Alias group fixture",
          },
          {
            scopeId,
            season: "2026/27",
            inputSetId: workspace.id,
            sourceType: "WISHES_PDF",
            sourceRef: "alias-real-wishes",
            parsedJson: JSON.stringify(wishes),
            displayName: "Alias wish fixture",
          },
        ],
      });
      await syncInputSetSourceCaches(workspace.id);
      let model = JSON.parse(
        (
          await db.rasterInputSet.findUniqueOrThrow({
            where: { id: workspace.id },
          })
        ).seasonModelJson!,
      );
      const club = model.clubs.find(
        (candidate: { name: string }) =>
          candidate.name === "SC Grün-Weiß Paderborn",
      );
      const team = model.teams.find(
        (candidate: { clubId: string }) => candidate.clubId === club.id,
      );
      await reviewSourceIdentityAlias({
        inputSetId: workspace.id,
        kind: "CLUB",
        rawIdentity: "SC GW Paderborn",
        targetIdentity: club.id,
        createNewIdentity: false,
      });
      await reviewSourceIdentityAlias({
        inputSetId: workspace.id,
        kind: "TEAM",
        rawIdentity: "SC GW Paderborn :: Erwachsene I",
        targetIdentity: team.id,
        createNewIdentity: false,
      });
      await syncInputSetSourceCaches(workspace.id);
      await syncInputSetSourceCaches(workspace.id);
      model = JSON.parse(
        (
          await db.rasterInputSet.findUniqueOrThrow({
            where: { id: workspace.id },
          })
        ).seasonModelJson!,
      );
      expect(
        model.teams.find(
          (candidate: { id: string }) => candidate.id === team.id,
        ),
      ).toMatchObject({
        clubId: club.id,
        homeWeekday: "friday",
        startTime: "20:00",
        wishMatchId: expect.any(String),
      });
      expect(await unresolvedSourceIdentityAliases(workspace.id)).toEqual([]);
      const storedWishes = await db.rasterWish.findMany({
        where: { inputSetId: workspace.id },
      });
      expect(storedWishes).toHaveLength(1);
      expect(storedWishes[0].clubId).toBe(club.id);
      model.groups.forEach((group: { planningStatus: string }) => {
        group.planningStatus = "include";
      });
      await db.rasterInputSet.update({
        where: { id: workspace.id },
        data: { seasonModelJson: JSON.stringify(model) },
      });
      await inferHallCapacitiesFromInputSet(
        workspace.id,
        "alias-integration-user",
      );
      await inferHallCapacitiesFromInputSet(
        workspace.id,
        "alias-integration-user",
      );
      const capacities = await db.rasterHallCapacity.findMany({
        where: { scopeId },
      });
      expect(
        capacities.filter((capacity) => capacity.clubId === club.id),
      ).toHaveLength(1);
      expect(
        capacities.some((capacity) => capacity.clubId === "sc-gw-paderborn"),
      ).toBe(false);
      expect((await validateInputSet(workspace.id))?.errors).toEqual([]);
    }, 120_000);
  },
);
