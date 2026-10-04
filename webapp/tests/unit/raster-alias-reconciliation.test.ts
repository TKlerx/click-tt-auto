import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  resolveSourceIdentityAlias,
  unresolvedSourceIdentityAliases,
} from "@/services/raster/sourceIdentityAliases";
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

// Regression goals: avoid silent ambiguity, stale workspace targets and unrelated blockers.
describe("reconciled alias isolation", () => {
  beforeEach(() => vi.resetAllMocks());
  const input = {
    scopeId: "owl",
    season: "2026/27",
    kind: "CLUB" as const,
    rawIdentity: "SC Example",
    canonicalCandidates: [{ id: "club-a", name: "SC Example" }],
  };
  it("never applies a saved target absent from this workspace", async () => {
    prismaMock.rasterSourceIdentityAlias.findUnique.mockResolvedValue({
      reviewState: "CONFIRMED",
      canonicalIdentity: "other-workspace-club",
      matchConfidence: "MANUAL",
    } as never);
    const result = await resolveSourceIdentityAlias({
      ...input,
      canonicalCandidates: [],
    });
    expect(result.state).toBe("pending");
    expect(prismaMock.rasterSourceIdentityAlias.upsert).not.toHaveBeenCalled();
  });
  it("clears stale suggestions when the match becomes ambiguous", async () => {
    await resolveSourceIdentityAlias({
      ...input,
      canonicalCandidates: [
        { id: "a", name: "SC Example" },
        { id: "b", name: "SC Example" },
      ],
    });
    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          canonicalIdentity: null,
          canonicalName: null,
          reviewState: "PENDING",
        }),
      }),
    );
  });
  it("does not query unrelated pending aliases when the workspace has no references", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: "{}",
    } as never);
    await expect(
      unresolvedSourceIdentityAliases("workspace-b"),
    ).resolves.toEqual([]);
    expect(
      prismaMock.rasterSourceIdentityAlias.findMany,
    ).not.toHaveBeenCalled();
  });
  it("limits readiness blockers to this workspace's kind and normalized source keys", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: JSON.stringify({
        sourceIdentityReferences: [
          { kind: "TEAM", normalizedSourceName: "sconeher reni" },
        ],
      }),
    } as never);
    await unresolvedSourceIdentityAliases("workspace-a");
    expect(prismaMock.rasterSourceIdentityAlias.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scopeId: "owl",
          season: "2026/27",
          OR: [{ kind: "TEAM", normalizedSourceName: "sconeher reni" }],
        },
      }),
    );
  });
  it("blocks a stale confirmed target locally without erasing the shared review", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: JSON.stringify({
        clubs: [],
        sourceIdentityReferences: [
          { kind: "CLUB", normalizedSourceName: "scone" },
        ],
      }),
    } as never);
    prismaMock.rasterSourceIdentityAlias.findMany.mockResolvedValue([
      {
        kind: "CLUB",
        canonicalIdentity: "absent",
        canonicalName: "Other workspace",
        reviewState: "CONFIRMED",
        matchConfidence: "MANUAL",
      },
    ] as never);
    expect(await unresolvedSourceIdentityAliases("workspace-b")).toMatchObject([
      { canonicalIdentity: null, canonicalName: null, reviewState: "PENDING" },
    ]);
    expect(prismaMock.rasterSourceIdentityAlias.upsert).not.toHaveBeenCalled();
  });
  it("automatically confirms a unique normalized exact name", async () => {
    await expect(resolveSourceIdentityAlias(input)).resolves.toMatchObject({
      state: "confirmed",
      canonicalIdentity: "club-a",
    });
    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          matchConfidence: "EXACT",
          reviewState: "CONFIRMED",
        }),
      }),
    );
  });
});
