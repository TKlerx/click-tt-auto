import { afterEach, describe, expect, it, vi } from "vitest";

const routeContext = vi.hoisted(() => ({ requireRasterInputSet: vi.fn() }));
const audit = vi.hoisted(() => ({ logRasterAudit: vi.fn() }));
const access = vi.hoisted(() => ({ canUseRasterLevel: vi.fn(() => false) }));
const services = vi.hoisted(() => {
  class BaselineImportConflictError extends Error {}
  class BaselineImportEmptyError extends Error {}
  class BaselineImportError extends Error {}
  class BaselineValidationError extends Error {}
  return {
    BaselineImportConflictError,
    BaselineImportEmptyError,
    BaselineImportError,
    BaselineValidationError,
    getManualBaseline: vi.fn(),
    importManualBaseline: vi.fn(),
    reviewManualBaselineRow: vi.fn(),
  };
});

vi.mock("@/lib/raster/route-context", () => routeContext);
vi.mock("@/lib/raster/audit", () => audit);
vi.mock("@/lib/raster/access", () => access);
vi.mock("@/services/raster", () => services);

import { GET, POST } from "@/app/api/raster/input-sets/[id]/baseline/route";
import { PATCH } from "@/app/api/raster/input-sets/[id]/baseline/rows/[rowId]/route";

const context = {
  user: { id: "user-1" },
  inputSet: { id: "input-1", scope: { code: "OWL" } },
};

describe("manual baseline API", () => {
  afterEach(() => vi.clearAllMocks());

  it("lets viewers read without triggering a crawl", async () => {
    routeContext.requireRasterInputSet.mockResolvedValue(context);
    services.getManualBaseline.mockResolvedValue({
      active: null,
      versions: [],
      counts: { total: 0 },
    });
    const response = await GET(new Request("http://test/baseline"), {
      params: Promise.resolve({ id: "input-1" }),
    });
    expect(response.status).toBe(200);
    expect(services.importManualBaseline).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      active: null,
      canEdit: false,
    });
  });

  it("imports for schedulers and returns concurrent imports as 409", async () => {
    routeContext.requireRasterInputSet.mockResolvedValue(context);
    services.importManualBaseline.mockResolvedValueOnce({
      active: { id: "baseline-1", status: "READY" },
      versions: [],
      counts: { total: 4 },
    });
    const success = await POST(
      new Request("http://test/baseline", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "input-1" }) },
    );
    expect(success.status).toBe(200);
    expect(audit.logRasterAudit).toHaveBeenCalled();

    services.importManualBaseline.mockRejectedValueOnce(
      new services.BaselineImportConflictError("already running"),
    );
    const conflict = await POST(
      new Request("http://test/baseline", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "input-1" }) },
    );
    expect(conflict.status).toBe(409);
  });

  it("returns only sanitized crawl failures", async () => {
    routeContext.requireRasterInputSet.mockResolvedValue(context);
    services.importManualBaseline.mockRejectedValue(
      new services.BaselineImportError("click-TT baseline import failed."),
    );
    const response = await POST(
      new Request("http://test/baseline", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "input-1" }) },
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /password|cookie|token|page dump/i,
    );
  });

  it("uses the scheduler gate for every mutation and accepts row decisions", async () => {
    const denied = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
    routeContext.requireRasterInputSet.mockResolvedValueOnce({ error: denied });
    const deniedResponse = await PATCH(
      new Request("http://test/row", {
        method: "PATCH",
        body: JSON.stringify({ decision: "ignore" }),
      }),
      { params: Promise.resolve({ id: "input-1", rowId: "row-1" }) },
    );
    expect(deniedResponse.status).toBe(403);
    expect(services.reviewManualBaselineRow).not.toHaveBeenCalled();

    routeContext.requireRasterInputSet.mockResolvedValueOnce(context);
    services.reviewManualBaselineRow.mockResolvedValue({
      row: { id: "row-1" },
      status: "READY",
      counts: { total: 1 },
    });
    const accepted = await PATCH(
      new Request("http://test/row", {
        method: "PATCH",
        body: JSON.stringify({ decision: "map", targetTeamId: "team-1" }),
      }),
      { params: Promise.resolve({ id: "input-1", rowId: "row-1" }) },
    );
    expect(accepted.status).toBe(200);
    expect(services.reviewManualBaselineRow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSetId: "input-1",
        rowId: "row-1",
        decision: { decision: "map", targetTeamId: "team-1" },
      }),
    );
  });
});
