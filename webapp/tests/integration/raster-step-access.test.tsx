import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Role } from "../../generated/prisma/enums";

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const { prisma } = vi.hoisted(() => ({
  prisma: {
    scope: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const services = vi.hoisted(() => ({
  listHallCapacities: vi.fn(),
  listInputSets: vi.fn(),
  listRasterSourcesForInputSet: vi.fn(),
  listRasterSourcesForScope: vi.fn(),
  listUpperLeagueReview: vi.fn(),
  listWishImportReview: vi.fn(),
  adoptLegacyRasterSources: vi.fn(),
  listScenarios: vi.fn(),
  reviewHallCapacitiesForInputSet: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/services/raster", () => services);

import ImportPage from "@/app/(dashboard)/raster/import/page";
import ReviewPage from "@/app/(dashboard)/raster/review/page";
import RunPage from "@/app/(dashboard)/raster/run/page";
import RunsPage from "@/app/(dashboard)/raster/runs/page";

const steps = [
  {
    name: "import",
    page: ImportPage,
    load: services.listRasterSourcesForInputSet,
  },
  { name: "review", page: ReviewPage, load: services.listHallCapacities },
  { name: "run", page: RunPage, load: services.listInputSets },
  { name: "runs", page: RunsPage, load: services.listScenarios },
] as const;

describe("raster step access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(steps)(
    "$name denies inaccessible scopes before loading step data",
    async ({ page }) => {
      requireSession.mockResolvedValue({
        id: "user-1",
        role: Role.SCOPE_USER,
      });
      prisma.scope.findMany.mockResolvedValue([scope("OWL")]);
      prisma.scope.findFirst.mockResolvedValue(null);

      const result = await page({
        searchParams: Promise.resolve({ scope: "OWL", season: "2026/27" }),
      });

      expect(collectText(result).join(" ")).toContain("not authorized");
      expect(services.listInputSets).not.toHaveBeenCalled();
      expect(services.listHallCapacities).not.toHaveBeenCalled();
      expect(services.listRasterSourcesForInputSet).not.toHaveBeenCalled();
      expect(services.listRasterSourcesForScope).not.toHaveBeenCalled();
      expect(services.listScenarios).not.toHaveBeenCalled();
    },
  );

  it.each(steps)(
    "$name loads content for accessible scopes",
    async ({ page, load }) => {
      requireSession.mockResolvedValue({
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
      });
      prisma.scope.findMany.mockResolvedValue([scope("OWL")]);
      services.listInputSets.mockResolvedValue(
        load === services.listRasterSourcesForInputSet
          ? [inputSet()]
          : [],
      );
      services.listHallCapacities.mockResolvedValue([]);
      services.listRasterSourcesForInputSet.mockResolvedValue([]);
      services.listRasterSourcesForScope.mockResolvedValue([]);
      services.listUpperLeagueReview.mockResolvedValue(null);
      services.listWishImportReview.mockResolvedValue(null);
      services.listScenarios.mockResolvedValue([]);

      await page({
        searchParams: Promise.resolve({ scope: "OWL", season: "2026/27" }),
      });

      expect(load).toHaveBeenCalled();
    },
  );

  it("does not adopt legacy sources for read-only import viewers", async () => {
    requireSession.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
    });
    prisma.scope.findMany.mockResolvedValue([scope("OWL")]);
    prisma.scope.findFirst.mockResolvedValue({ id: "scope-OWL" });
    services.listInputSets.mockResolvedValue([inputSet()]);
    services.listRasterSourcesForInputSet.mockResolvedValue([]);
    services.listUpperLeagueReview.mockResolvedValue(null);
    services.listWishImportReview.mockResolvedValue(null);

    await ImportPage({
      searchParams: Promise.resolve({ scope: "OWL", season: "2026/27" }),
    });

    expect(services.adoptLegacyRasterSources).not.toHaveBeenCalled();
    expect(services.listRasterSourcesForInputSet).toHaveBeenCalledWith(
      "input-1",
    );
  });

  it("adopts legacy sources for scheduler import viewers", async () => {
    requireSession.mockResolvedValue({
      id: "scheduler-1",
      role: Role.SCOPE_ADMIN,
    });
    prisma.scope.findMany.mockResolvedValue([scope("OWL")]);
    prisma.scope.findFirst.mockResolvedValue({ id: "scope-OWL" });
    services.listInputSets.mockResolvedValue([inputSet()]);
    services.listRasterSourcesForInputSet.mockResolvedValue([]);
    services.listUpperLeagueReview.mockResolvedValue(null);
    services.listWishImportReview.mockResolvedValue(null);

    await ImportPage({
      searchParams: Promise.resolve({ scope: "OWL", season: "2026/27" }),
    });

    expect(services.adoptLegacyRasterSources).toHaveBeenCalledWith("input-1");
  });
});

function inputSet() {
  return {
    id: "input-1",
    name: "OWL 2026/27",
    scopeId: "scope-OWL",
    season: "2026/27",
    status: "DRAFT",
    seasonModelJson: null,
    _count: { wishes: 0, fixedRasterzahlen: 0, runs: 0 },
  };
}

function scope(code: string) {
  return {
    id: `scope-${code}`,
    code,
    name: code,
    parent: {
      code: "WTTV",
      name: "WTTV",
      parent: { code: "DE", name: "Germany" },
    },
  };
}

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean")
    return [];
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child) => collectText(child));
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => ReactNode;
      return collectText(render(element.props));
    }
    return collectText(element.props.children);
  }
  return [];
}
