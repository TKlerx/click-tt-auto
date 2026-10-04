import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/raster/input-sets/[id]/club-aliases/route";
import { prismaMock } from "@/lib/__mocks__/db";
const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  sync: vi.fn(),
  infer: vi.fn(),
  legacy: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db", async () => ({
  prisma: (await import("@/lib/__mocks__/db")).prismaMock,
}));
vi.mock("@/lib/raster/route-context", () => ({
  requireRasterInputSet: mocks.require,
}));
vi.mock("@/lib/raster/audit", () => ({ logRasterAudit: mocks.audit }));
vi.mock("@/services/raster", () => ({
  syncInputSetSourceCaches: mocks.sync,
  inferHallCapacitiesFromInputSet: mocks.infer,
  updateClubAliasMapping: mocks.legacy,
}));
const model = {
  clubs: [{ id: "club-a", name: "SC Alpha" }],
  teams: [{ id: "team-a", clubId: "club-a", label: "Herren I" }],
  sourceIdentityReferences: [
    { kind: "CLUB", normalizedSourceName: "scalfa" },
    { kind: "TEAM", normalizedSourceName: "scalphaherren1" },
  ],
};
const inputSet = {
  id: "workspace-a",
  scopeId: "owl",
  season: "2026/27",
  scope: { code: "OWL" },
  seasonModelJson: JSON.stringify(model),
};
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: inputSet.id }) },
  );
describe("admin source identity review route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.require.mockResolvedValue({ inputSet, user: { id: "admin" } });
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(inputSet as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([]);
  });
  it.each(["CLUB", "TEAM"])(
    "accepts or overrides a persisted %s suggestion without requiring a legacy club ID",
    async (kind) => {
      const response = await post({
        kind,
        sourceClubId: kind === "CLUB" ? "SC Alfa" : "SC Alpha :: Herren 1",
        targetClubId: kind === "CLUB" ? "club-a" : "team-a",
        canonicalName: "spoofed",
      });
      expect(response.status).toBe(200);
      expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind,
            reviewState: "CONFIRMED",
            matchConfidence: "MANUAL",
            canonicalName:
              kind === "CLUB" ? "SC Alpha" : "SC Alpha :: Herren I",
          }),
        }),
      );
      expect(mocks.legacy).not.toHaveBeenCalled();
    },
  );
  it.each(["CLUB", "TEAM"])(
    "creates a %s identity without taking the legacy mapping path",
    async (kind) => {
      const raw = kind === "CLUB" ? "SC Alfa" : "SC Alpha :: Herren 1";
      expect(
        (
          await post({
            kind,
            sourceClubId: raw,
            targetClubId: raw,
            createNewIdentity: true,
          })
        ).status,
      ).toBe(200);
      expect(mocks.legacy).not.toHaveBeenCalled();
      expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            matchConfidence: "CREATED",
            canonicalIdentity: raw,
          }),
        }),
      );
    },
  );
  it("rejects another workspace's source", async () => {
    expect(
      (
        await post({
          kind: "TEAM",
          sourceClubId: "other :: Herren I",
          targetClubId: "team-a",
        })
      ).status,
    ).toBe(404);
    expect(prismaMock.rasterSourceIdentityAlias.upsert).not.toHaveBeenCalled();
  });
  it("rejects another workspace's target", async () => {
    expect(
      (
        await post({
          kind: "TEAM",
          sourceClubId: "SC Alpha :: Herren 1",
          targetClubId: "other-team",
        })
      ).status,
    ).toBe(404);
    expect(prismaMock.rasterSourceIdentityAlias.upsert).not.toHaveBeenCalled();
  });
  it.each([401, 403])(
    "does not mutate aliases when authorization returns %s",
    async (status) => {
      mocks.require.mockResolvedValue({
        error: NextResponse.json({ error: "denied" }, { status }),
      });
      expect(
        (await post({ sourceClubId: "SC Alfa", targetClubId: "club-a" }))
          .status,
      ).toBe(status);
      expect(mocks.require).toHaveBeenCalledWith(
        expect.any(Request),
        inputSet.id,
        "admin",
      );
      expect(
        prismaMock.rasterSourceIdentityAlias.upsert,
      ).not.toHaveBeenCalled();
    },
  );
});
