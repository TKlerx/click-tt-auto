"use client";

import { useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import type { RasterScenario } from "@/lib/raster/scenarios";

const kpiRows = [
  ["objective", "Objective"],
  ["totalHallExcess", "Total excess"],
  ["maxHallExcess", "Max excess"],
  ["affectedClubs", "Affected clubs"],
  ["wishMisses", "Wish misses"],
  ["sameClubDerbyIssues", "ST4 derbies"],
] as const;

type KpiKey = (typeof kpiRows)[number][0];

export function ScenarioComparison({
  scenarios,
}: {
  scenarios: RasterScenario[];
}) {
  const comparable = scenarios.filter((scenario) => scenario.kpiSummary);
  const [baselineId, setBaselineId] = useState(comparable[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(comparable.slice(0, 3).map((scenario) => scenario.id)),
  );
  const selected = useMemo(
    () => comparable.filter((scenario) => selectedIds.has(scenario.id)),
    [comparable, selectedIds],
  );
  const baseline =
    comparable.find((scenario) => scenario.id === baselineId) ?? selected[0];

  if (!scenarios.length) return null;

  return (
    <details className="mt-4 border-t border-[var(--border)] pt-3" open>
      <summary className="cursor-pointer text-sm font-medium">
        Scenarios ({scenarios.length})
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {comparable.map((scenario) => (
          <label
            className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs"
            key={scenario.id}
          >
            <input
              checked={selectedIds.has(scenario.id)}
              onChange={() =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(scenario.id)) next.delete(scenario.id);
                  else next.add(scenario.id);
                  return next;
                })
              }
              type="checkbox"
            />
            {scenario.name}
          </label>
        ))}
        {baseline ? (
          <label className="flex items-center gap-2 text-xs">
            Baseline
            <select
              className="h-8 rounded-md border border-[var(--border)] bg-transparent px-2"
              onChange={(event) => setBaselineId(event.target.value)}
              value={baseline.id}
            >
              {selected.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <ScenarioComparisonTable baseline={baseline} scenarios={selected} />
    </details>
  );
}

export function ScenarioComparisonTable({
  baseline,
  scenarios,
}: {
  baseline?: RasterScenario;
  scenarios: RasterScenario[];
}) {
  if (!baseline || scenarios.length < 2) {
    return (
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        Select at least two completed scenarios to compare KPIs.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="py-2 pr-4 font-medium">KPI</th>
            {scenarios.map((scenario) => (
              <th className="py-2 pr-4 font-medium" key={scenario.id}>
                <span className="block">{scenario.name}</span>
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  {scenario.strategy} / {scenario.status}
                  {scenario.stale ? " / stale" : ""}
                </span>
                {scenario.detailRef ? (
                  <a
                    className="mt-1 block text-xs font-normal text-[var(--primary)]"
                    href={withBasePath(scenario.detailRef)}
                  >
                    Details
                  </a>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kpiRows.map(([key, label]) => (
            <tr className="border-b border-[var(--border)]" key={key}>
              <td className="py-2 pr-4 text-[var(--muted-foreground)]">
                {label}
              </td>
              {scenarios.map((scenario) => (
                <td className="py-2 pr-4" key={scenario.id}>
                  {formatKpi(scenario, key)}
                  {scenario.id !== baseline.id ? (
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      {formatDelta(kpiDelta(scenario, baseline, key))}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function kpiDelta(
  scenario: RasterScenario,
  baseline: RasterScenario,
  key: KpiKey,
) {
  const value = scenario.kpiSummary?.[key];
  const baselineValue = baseline.kpiSummary?.[key];
  if (typeof value !== "number" || typeof baselineValue !== "number")
    return null;
  return value - baselineValue;
}

function formatKpi(scenario: RasterScenario, key: KpiKey) {
  const value = scenario.kpiSummary?.[key];
  return typeof value === "number" ? value.toLocaleString("de-DE") : "n/a";
}

function formatDelta(delta: number | null) {
  if (delta === null) return "";
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : String(delta);
}
