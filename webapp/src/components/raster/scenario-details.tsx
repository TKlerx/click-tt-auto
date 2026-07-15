import type { RasterScenario } from "@/lib/raster/scenarios";

export function ScenarioDetailsSummary({
  scenario,
}: {
  scenario: RasterScenario;
}) {
  return (
    <div className="grid gap-2 text-sm md:grid-cols-3">
      <span>
        <strong>Strategy:</strong> {scenario.strategy}
      </span>
      <span>
        <strong>Status:</strong> {scenario.status}
      </span>
      <span>
        <strong>Objective:</strong>{" "}
        {scenario.kpiSummary?.objective?.toLocaleString("de-DE") ?? "n/a"}
      </span>
    </div>
  );
}
