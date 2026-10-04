import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { infeasibilityRunMessage } from "@/lib/raster/run-outcome";
import { InputSetRunActions } from "@/components/raster/input-set-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/raster/generate",
}));

function renderRun(solverStatus: string | null, outcome = "INFEASIBLE") {
  return renderToStaticMarkup(createElement(InputSetRunActions, {
    inputSetId: "input-1",
    status: "READY",
    baselines: [{ id: "baseline-1", label: "Verified manual baseline" }],
    runs: [{
      id: "run-1", status: "FAILED", outcome, objectiveValue: null,
      solverStatus, coverageJson: JSON.stringify({ spannedScopes: ["scope-a"] }),
      createdAt: "2026-09-01T00:00:00Z", finishedAt: "2026-09-01T00:00:01Z",
      snapshot: null,
    }],
  }));
}

// UI regression goal: explain no-solution runs without losing legacy fallback,
// software-failure distinctions, or the upstream manual baseline selector.
describe("infeasible raster run presentation", () => {
  it("shows propagated hard-constraint diagnostics instead of the generic no-solution copy", () => {
    const diagnostic = "No feasible assignment exists. Fixed schedule numbers: Group L / G12 fixes schedule number 1 for more than one team: Team A, Team B.";
    expect(infeasibilityRunMessage(diagnostic, null)).toBe(diagnostic);
    const html = renderRun(diagnostic);
    expect(html).toContain(diagnostic);
    expect(html).toContain("No feasible assignment");
    expect(html).toContain("Verified manual baseline");
    expect(html).not.toContain("Software failure");
  });

  it.each([null, "", "   "])("keeps the scoped fallback for legacy no-solution runs with status %s", (status) => {
    const message = "No feasible assignment for constraints including scope-a.";
    expect(infeasibilityRunMessage(status, JSON.stringify({ spannedScopes: ["scope-a"] }))).toBe(message);
    expect(renderRun(status)).toContain(message);
  });

  it("keeps software failures distinct from hard-constraint contradictions", () => {
    const html = renderRun("CP-SAT subprocess crashed", "FAILED");
    expect(html).toContain("Software failure");
    expect(html).toContain("CP-SAT subprocess crashed");
    expect(html).not.toContain("No feasible assignment");
  });
});
