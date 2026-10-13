import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  resolveSourceIdentityAlias,
  saveSourceIdentityAlias,
} from "@/services/raster/sourceIdentityAliases";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

describe("source identity aliases", () => {
  afterEach(() => vi.clearAllMocks());

  it("reuses a confirmed club alias only in its scope and season", async () => {
    prismaMock.rasterSourceIdentityAlias.findUnique.mockResolvedValue({
      reviewState: "CONFIRMED",
      canonicalIdentity: "sc-gruen-weiss-paderborn",
      canonicalName: "SC Grün-Weiß Paderborn",
    } as never);

    await expect(
      resolveSourceIdentityAlias({
        scopeId: "owl",
        season: "2026/27",
        kind: "CLUB",
        rawIdentity: "SC GW Paderborn",
        canonicalCandidates: [
          { id: "sc-gruen-weiss-paderborn", name: "SC Grün-Weis Paderborn" },
        ],
      }),
    ).resolves.toMatchObject({
      state: "confirmed",
      canonicalIdentity: "sc-gruen-weiss-paderborn",
    });
    expect(
      prismaMock.rasterSourceIdentityAlias.findUnique,
    ).toHaveBeenCalledWith({
      where: {
        scopeId_season_kind_normalizedSourceName: {
          scopeId: "owl",
          season: "2026/27",
          kind: "CLUB",
          normalizedSourceName: "scgwpaderborn",
        },
      },
    });
  });

  it("records a fuzzy team match as a pending suggestion without applying it", async () => {
    prismaMock.rasterSourceIdentityAlias.findUnique.mockResolvedValue(null);
    prismaMock.rasterSourceIdentityAlias.upsert.mockResolvedValue({} as never);

    await expect(
      resolveSourceIdentityAlias({
        scopeId: "owl",
        season: "2026/27",
        kind: "TEAM",
        rawIdentity: "Herren 1",
        canonicalCandidates: [{ id: "team-1", name: "Herren I" }],
      }),
    ).resolves.toMatchObject({ state: "pending" });
    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reviewState: "PENDING",
          matchConfidence: "FUZZY",
          source: "cache-sync",
        }),
      }),
    );
  });

  it("records the SC GW abbreviation as a review-only fuzzy club suggestion", async () => {
    prismaMock.rasterSourceIdentityAlias.findUnique.mockResolvedValue(null);
    prismaMock.rasterSourceIdentityAlias.upsert.mockResolvedValue({} as never);

    await expect(
      resolveSourceIdentityAlias({
        scopeId: "owl",
        season: "2026/27",
        kind: "CLUB",
        rawIdentity: "SC GW Paderborn",
        canonicalCandidates: [
          { id: "sc-gruen-weiss-paderborn", name: "SC Grün-Weiß Paderborn" },
        ],
      }),
    ).resolves.toMatchObject({ state: "pending" });

    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          canonicalIdentity: "sc-gruen-weiss-paderborn",
          canonicalName: "SC Grün-Weiß Paderborn",
          reviewState: "PENDING",
          matchConfidence: "FUZZY",
          source: "cache-sync",
        }),
      }),
    );
  });

  it("persists an admin-created team identity with provenance", async () => {
    prismaMock.rasterSourceIdentityAlias.upsert.mockResolvedValue({
      id: "alias-1",
    } as never);

    await saveSourceIdentityAlias({
      scopeId: "owl",
      season: "2026/27",
      kind: "TEAM",
      rawIdentity: "Damen Spezial",
      canonicalIdentity: "team-damen-spezial",
      canonicalName: "Damen Spezial",
      matchConfidence: "CREATED",
      source: "admin-review",
    });

    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reviewState: "CONFIRMED",
          rawSourceName: "Damen Spezial",
          normalizedSourceName: "damenspezial",
          kind: "TEAM",
          matchConfidence: "CREATED",
          source: "admin-review",
        }),
      }),
    );
  });
});
