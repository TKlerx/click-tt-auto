import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  kpiDelta,
  ScenarioComparisonTable,
} from "@/components/raster/scenario-comparison";
import { scenarioFixture } from "./fixtures/raster-scenarios";

describe("ScenarioComparison", () => {
  it("renders baseline deltas", () => {
    const baseline = scenarioFixture({
      id: "manual",
      name: "Manual",
      kpiSummary: {
        ...scenarioFixture().kpiSummary!,
        objective: 10,
      },
    });
    const cpSat = scenarioFixture({
      id: "cp-sat",
      name: "CP-SAT",
      kpiSummary: {
        ...scenarioFixture().kpiSummary!,
        objective: 7,
      },
    });

    const html = renderToStaticMarkup(
      <ScenarioComparisonTable
        baseline={baseline}
        scenarios={[baseline, cpSat]}
      />,
    );

    expect(html).toContain("Manual");
    expect(html).toContain("CP-SAT");
    expect(html).toContain("-3");
    expect(kpiDelta(cpSat, baseline, "objective")).toBe(-3);
  });
});
