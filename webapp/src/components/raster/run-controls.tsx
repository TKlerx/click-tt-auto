"use client";

export type RasterRunStrategy = "cp_sat" | "initial_heuristic";

export function RunSettingsFields({
  disabled,
  strategy,
  setStrategy,
  timeLimitSeconds,
  setTimeLimitSeconds,
}: {
  disabled: boolean;
  strategy: RasterRunStrategy;
  setStrategy: (value: RasterRunStrategy) => void;
  timeLimitSeconds: number;
  setTimeLimitSeconds: (value: number) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--border)] p-3 text-sm md:grid-cols-[minmax(12rem,1fr)_10rem]">
      <label className="grid gap-1 font-medium">
        Optimizer
        <select
          className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 font-normal"
          disabled={disabled}
          onChange={(event) =>
            setStrategy(event.target.value as RasterRunStrategy)
          }
          value={strategy}
        >
          <option value="cp_sat">CP-SAT</option>
          <option value="initial_heuristic">Initial heuristic</option>
        </select>
      </label>
      <label className="grid gap-1 font-medium">
        Time budget
        <input
          className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 font-normal"
          disabled={disabled || strategy === "initial_heuristic"}
          min={1}
          onChange={(event) =>
            setTimeLimitSeconds(Number(event.target.value) || 60)
          }
          type="number"
          value={timeLimitSeconds}
        />
      </label>
    </div>
  );
}
