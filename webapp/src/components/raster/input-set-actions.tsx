"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { putGymCapacity } from "@/components/raster/capacity/capacity-client";
import {
  RunSettingsFields,
  type RasterRunStrategy,
} from "@/components/raster/run-controls";
import { BusyLabel } from "@/components/ui/busy-label";

type FixedScheduleNumber = {
  clubId: string;
  teamLabel: string;
  rasterzahl: number;
  source: string;
};

type RasterRunRow = {
  id: string;
  status: string;
  outcome: string | null;
  objectiveValue: number | null;
  solverStatus?: string | null;
  settings?: string | null;
  createdAt: Date | string;
  finishedAt: Date | string | null;
  snapshot: { id: string } | null;
};

type HallCapacityReview = {
  inferredCount: number;
  missingCount: number;
  insufficientCount: number;
  higherCount: number;
  blockingCount: number;
  rows: Array<{
    id: string | null;
    scope: string;
    clubId: string;
    hall: string;
    weekday: string;
    capacity: number;
    storedCapacity: number | null;
    basis: string | null;
    status: "missing" | "insufficient" | "ok" | "higher";
  }>;
};

export function CreateInputSetForm({
  scope,
  season,
}: {
  scope: string;
  season: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function createInputSet(formData: FormData) {
    setMessage(null);
    const response = await fetch(withBasePath("/api/raster/input-sets"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope,
        season,
        name: String(formData.get("name") ?? ""),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessage(body.error ?? `Failed (${response.status})`);
      return;
    }
    setMessage("Created");
    router.refresh();
  }

  return (
    <form
      action={createInputSet}
      className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] px-4 py-3"
    >
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">
        Input set name
        <input
          className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
          defaultValue={`${scope} ${season}`}
          name="name"
          required
        />
      </label>
      <button
        className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
        type="submit"
      >
        Create input set
      </button>
      {message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </form>
  );
}

export function FixedScheduleNumbersForm({
  inputSetId,
  rows,
}: {
  inputSetId: string;
  rows: FixedScheduleNumber[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function saveFixedScheduleNumbers(formData: FormData) {
    setMessage(null);
    let fixedRasterzahlen: unknown;
    try {
      fixedRasterzahlen = JSON.parse(String(formData.get("fixedRasterzahlen")));
    } catch {
      setMessage("Invalid JSON");
      return;
    }
    const response = await fetch(
      withBasePath(`/api/raster/input-sets/${inputSetId}/fixed-rasterzahlen`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixedRasterzahlen }),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessage(body.error ?? `Failed (${response.status})`);
      return;
    }
    setMessage("Saved");
    router.refresh();
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium">
        Fixed schedule numbers ({rows.length})
      </summary>
      <form action={saveFixedScheduleNumbers} className="mt-3 grid gap-3">
        <textarea
          className="min-h-32 rounded-md border border-[var(--border)] bg-transparent p-3 font-mono text-xs"
          defaultValue={JSON.stringify(rows, null, 2)}
          name="fixedRasterzahlen"
        />
        <div className="flex items-center gap-3">
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            type="submit"
          >
            Save fixed numbers
          </button>
          {message ? (
            <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
          ) : null}
        </div>
      </form>
    </details>
  );
}

export function InputSetRunActions({
  inputSetId,
  status,
  runs,
  capacityReview,
  showCapacityReview = true,
}: {
  inputSetId: string;
  status: string;
  runs: RasterRunRow[];
  capacityReview?: HallCapacityReview;
  showCapacityReview?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<RasterRunStrategy>("cp_sat");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const capacityBlocked = (capacityReview?.blockingCount ?? 0) > 0;
  const capacityReviewMessage = capacityReview
    ? `Review gym capacities: ${capacityReview.missingCount} missing, ${capacityReview.insufficientCount} lower than inferred.`
    : null;

  async function post(path: string, label: string) {
    setBusy(label);
    setMessage(null);
    try {
      if (label === "Validate") {
        const selects = Array.from(
          document.querySelectorAll<HTMLSelectElement>(
            `[data-input-set-id="${inputSetId}"][data-raster-group-mode]`,
          ),
        );
        for (const select of selects) {
          if (select.value !== "single" && select.value !== "double") continue;
          const groupId = select.dataset.groupId;
          if (!groupId) continue;
          const saveResponse = await fetch(
            withBasePath(
              `/api/raster/input-sets/${inputSetId}/groups/${encodeURIComponent(
                groupId,
              )}`,
            ),
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ rasterMode: select.value }),
            },
          );
          if (!saveResponse.ok) {
            const body = (await saveResponse.json().catch(() => ({}))) as {
              error?: string;
            };
            setMessage(body.error ?? `Save failed (${saveResponse.status})`);
            return;
          }
        }
      }
      const response = await fetch(withBasePath(path), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body:
          label === "Run"
            ? JSON.stringify({ strategy, timeLimitSeconds })
            : "{}",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: string[];
        run?: {
          id?: string;
          jobId?: string | null;
          status?: string;
        };
        inputSet?: {
          status?: string;
          _count?: {
            wishes?: number;
            fixedRasterzahlen?: number;
          };
        };
        capacityReview?: HallCapacityReview;
      };
      if (!response.ok) {
        setMessage(body.error ?? `Failed (${response.status})`);
        return;
      }
      if (body.errors?.length) {
        setMessage(body.errors.join(" "));
      } else if (label === "Validate") {
        const wishes = body.inputSet?._count?.wishes ?? 0;
        const fixed = body.inputSet?._count?.fixedRasterzahlen ?? 0;
        setMessage(
          `Validation passed: ${wishes} wish rows, ${fixed} fixed schedule numbers. You can start a run.`,
        );
      } else if (label === "Run") {
        setMessage(
          `Run queued: ${body.run?.status ?? "PENDING"}${body.run?.jobId ? `, job ${body.run.jobId}` : ""}. Refresh to update progress.`,
        );
      } else {
        setMessage(`${label} done`);
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancel(runId: string) {
    setBusy(runId);
    setMessage(null);
    try {
      const response = await fetch(withBasePath(`/api/raster/runs/${runId}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Cancel failed (${response.status})`);
        return;
      }
      setMessage("Run hidden");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function refreshRuns() {
    setBusy("Refresh");
    router.refresh();
    setLastRefreshedAt(new Date());
    window.setTimeout(
      () => setBusy((current) => (current === "Refresh" ? null : current)),
      600,
    );
  }

  async function inferCapacities() {
    setBusy("Capacity");
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/capacities/infer`),
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        result?: { count?: number; needsReview?: number };
        error?: string;
      };
      if (!response.ok) {
        setMessage(
          body.error ?? `Capacity inference failed (${response.status})`,
        );
        return;
      }
      const count = body.result?.count ?? 0;
      const needsReview = body.result?.needsReview ?? 0;
      setMessage(
        needsReview > 0
          ? `Capacity rows inferred: ${count}. ${needsReview} stored capacities look too low and need review.`
          : `Capacity rows inferred: ${count}. You can queue a run after refresh.`,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveCapacityValue(
    row: HallCapacityReview["rows"][number],
    capacity: number,
    refresh = true,
  ) {
    if (!row.id) return false;
    setBusy(row.id);
    setMessage(null);
    try {
      const error = await putGymCapacity({
        capacity,
        scope: row.scope,
        id: row.id,
      });
      if (error) {
        setMessage(error);
        return false;
      }
      setMessage("Capacity saved. Validate again.");
      if (refresh) router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function saveCapacity(
    row: HallCapacityReview["rows"][number],
    formData: FormData,
  ) {
    await saveCapacityValue(row, Number(formData.get("capacity")));
  }

  async function acceptInferredCapacities(rows: HallCapacityReview["rows"]) {
    setBusy("Capacity");
    setMessage(null);
    try {
      for (const row of rows) {
        const saved = await saveCapacityValue(row, row.capacity, false);
        if (!saved) return;
      }
      setMessage("Inferred capacities accepted. Validate again.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveCapacityValues(
    updates: Array<{
      row: HallCapacityReview["rows"][number];
      capacity: number;
    }>,
  ) {
    setBusy("Capacity");
    setMessage(null);
    try {
      for (const update of updates) {
        const saved = await saveCapacityValue(
          update.row,
          update.capacity,
          false,
        );
        if (!saved) return;
      }
      setMessage("Capacities saved. Validate again.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <RunSettingsFields
        disabled={busy !== null || status !== "READY"}
        setStrategy={setStrategy}
        setTimeLimitSeconds={setTimeLimitSeconds}
        strategy={strategy}
        timeLimitSeconds={timeLimitSeconds}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
          disabled={busy !== null}
          onClick={() =>
            void post(
              `/api/raster/input-sets/${inputSetId}/validate`,
              "Validate",
            )
          }
          type="button"
        >
          {busy === "Validate" ? <BusyLabel label="Validating" /> : "Validate"}
        </button>
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
          disabled={busy !== null || status !== "READY" || capacityBlocked}
          onClick={() =>
            void post(`/api/raster/input-sets/${inputSetId}/runs`, "Run")
          }
          type="button"
        >
          {busy === "Run" ? <BusyLabel label="Queueing" /> : "Queue run"}
        </button>
        {status !== "READY" && !capacityBlocked ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            Validate before starting a run.
          </span>
        ) : null}
        {capacityBlocked ? (
          <>
            {capacityReview?.missingCount ? (
              <button
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                disabled={busy !== null}
                onClick={() => void inferCapacities()}
                type="button"
              >
                {busy === "Capacity" ? (
                  <BusyLabel label="Inferring" />
                ) : (
                  "Infer missing capacities"
                )}
              </button>
            ) : null}
            <span className="text-sm text-[var(--muted-foreground)]">
              {capacityReviewMessage}
            </span>
          </>
        ) : null}
        {message && message !== capacityReviewMessage ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            {message}
          </span>
        ) : null}
        <button
          aria-label="Refresh runs"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)]"
          disabled={busy !== null}
          onClick={refreshRuns}
          title="Refresh runs"
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${busy === "Refresh" ? "animate-spin" : ""}`}
          />
        </button>
        {lastRefreshedAt ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            Refreshed {lastRefreshedAt.toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      {showCapacityReview && capacityBlocked && capacityReview ? (
        <CapacityWizard
          busy={busy}
          onAcceptAll={(rows) => void acceptInferredCapacities(rows)}
          onInfer={() => void inferCapacities()}
          onSave={(row, formData) => void saveCapacity(row, formData)}
          onSaveAll={(updates) => void saveCapacityValues(updates)}
          review={capacityReview}
        />
      ) : null}
      {runs.length ? (
        <div className="grid gap-2 text-sm">
          {runs.some(
            (run) => run.status === "PENDING" || run.status === "RUNNING",
          ) ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              A run is queued or running in the background. Refresh this page to
              update the status; results appear here when the worker finishes.
            </p>
          ) : null}
          {runs.map((run) => (
            <div
              className="grid gap-2 rounded-md border border-[var(--border)] px-3 py-2"
              key={run.id}
            >
              <div className="grid gap-2 md:grid-cols-[9rem_12rem_10rem_minmax(8rem,1fr)_auto]">
                <span className="font-medium">{runStateLabel(run)}</span>
                <span>{runOutcomeLabel(run.outcome, run.status)}</span>
                <span className="text-[var(--muted-foreground)]">
                  {runStrategyLabel(run.settings)}
                </span>
                <span
                  className="text-[var(--muted-foreground)]"
                  suppressHydrationWarning
                >
                  {formatRunTimestamp(run.createdAt)}
                </span>
                <span className="flex gap-2">
                  {run.snapshot ? (
                    <a
                      className="text-[var(--primary)]"
                      href={withBasePath(
                        `/raster/snapshots/${run.snapshot.id}`,
                      )}
                    >
                      Results
                    </a>
                  ) : null}
                  {run.status === "PENDING" || run.status === "RUNNING" ? (
                    <button
                      className="text-[var(--primary)]"
                      disabled={busy === run.id}
                      onClick={() => void cancel(run.id)}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      className="text-[var(--primary)]"
                      disabled={busy === run.id}
                      onClick={() => void cancel(run.id)}
                      type="button"
                    >
                      Archive
                    </button>
                  )}
                </span>
              </div>
              <RunPhaseBar
                outcome={run.outcome}
                solverStatus={run.solverStatus}
                snapshotId={run.snapshot?.id}
                status={run.status}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CapacityWizard({
  busy,
  onAcceptAll,
  onInfer,
  onSave,
  onSaveAll,
  review,
}: {
  busy: string | null;
  onAcceptAll: (rows: HallCapacityReview["rows"]) => void;
  onInfer: () => void;
  onSave: (row: HallCapacityReview["rows"][number], formData: FormData) => void;
  onSaveAll: (
    updates: Array<{
      row: HallCapacityReview["rows"][number];
      capacity: number;
    }>,
  ) => void;
  review: HallCapacityReview;
}) {
  const missing = review.rows.filter((row) => row.status === "missing");
  const insufficient = review.rows.filter(
    (row) => row.status === "insufficient",
  );
  const confirmed = review.rows.filter(
    (row) => row.status === "ok" || row.status === "higher",
  );
  const editable = [...insufficient, ...confirmed].filter((row) => row.id);
  function saveAllVisible() {
    onSaveAll(
      editable.map((row) => ({
        row,
        capacity: Number(
          document.querySelector<HTMLInputElement>(
            `[data-capacity-id="${row.id}"]`,
          )?.value ??
            row.storedCapacity ??
            row.capacity,
        ),
      })),
    );
  }
  return (
    <details className="rounded-md border border-[var(--border)] p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">
        Gym capacity review
      </summary>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Validation is blocked until these capacities are confirmed. Accept the
        inferred values, or edit individual rows and save them.
      </p>
      {editable.length ? (
        <button
          className="mt-3 h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
          disabled={busy !== null}
          onClick={saveAllVisible}
          type="button"
        >
          {busy === "Capacity" ? (
            <BusyLabel label="Saving" />
          ) : (
            "Save all visible"
          )}
        </button>
      ) : null}
      {missing.length ? (
        <div className="mt-3 grid gap-2">
          <button
            className="h-9 w-fit rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            disabled={busy !== null}
            onClick={onInfer}
            type="button"
          >
            {busy === "Capacity" ? (
              <BusyLabel label="Inferring" />
            ) : (
              "Infer missing capacities"
            )}
          </button>
          <CapacityRows rows={missing} />
        </div>
      ) : null}
      {insufficient.length ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              Capacities lower than inferred
            </p>
            <button
              className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              disabled={busy !== null}
              onClick={() => onAcceptAll(insufficient)}
              type="button"
            >
              {busy === "Capacity" ? (
                <BusyLabel label="Saving" />
              ) : (
                "Accept all inferred"
              )}
            </button>
          </div>
          {insufficient.map((row) => (
            <CapacityEditRow
              busy={busy}
              key={row.id ?? `${row.clubId}-${row.hall}-${row.weekday}`}
              min={row.capacity}
              onSave={onSave}
              row={row}
            />
          ))}
        </div>
      ) : null}
      {confirmed.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Edit confirmed capacities ({confirmed.length})
          </summary>
          <div className="mt-2 grid gap-2">
            {confirmed.map((row) => (
              <CapacityEditRow
                busy={busy}
                key={row.id ?? `${row.clubId}-${row.hall}-${row.weekday}`}
                min={1}
                onSave={onSave}
                row={row}
              />
            ))}
          </div>
        </details>
      ) : null}
    </details>
  );
}

function CapacityEditRow({
  busy,
  min,
  onSave,
  row,
}: {
  busy: string | null;
  min: number;
  onSave: (row: HallCapacityReview["rows"][number], formData: FormData) => void;
  row: HallCapacityReview["rows"][number];
}) {
  return (
    <form
      action={(formData) => onSave(row, formData)}
      className="grid gap-2 rounded-md border border-[var(--border)] p-2 md:grid-cols-[minmax(12rem,1fr)_8rem_7rem_auto]"
    >
      <span className="text-sm">
        {row.clubId}, gym {row.hall}, {row.weekday}
      </span>
      <span className="text-sm text-[var(--muted-foreground)]">
        stored {row.storedCapacity ?? 0}, inferred {row.capacity}
      </span>
      <input
        className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
        data-capacity-id={row.id ?? undefined}
        defaultValue={Math.max(
          row.storedCapacity ?? row.capacity,
          row.capacity,
        )}
        min={min}
        name="capacity"
        type="number"
      />
      <button
        className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
        disabled={busy !== null || !row.id}
        type="submit"
      >
        {busy === row.id ? <BusyLabel label="Saving" /> : "Save"}
      </button>
    </form>
  );
}

function CapacityRows({ rows }: { rows: HallCapacityReview["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <tr>
            <th className="px-2 py-2">Club</th>
            <th className="px-2 py-2">Gym</th>
            <th className="px-2 py-2">Day</th>
            <th className="px-2 py-2">Inferred</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="border-t border-[var(--border)]"
              key={`${row.clubId}-${row.hall}-${row.weekday}`}
            >
              <td className="px-2 py-2">{row.clubId}</td>
              <td className="px-2 py-2">{row.hall}</td>
              <td className="px-2 py-2">{row.weekday}</td>
              <td className="px-2 py-2 font-medium">{row.capacity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function runStatusLabel(status: string) {
  if (status === "PENDING") return "Waiting for worker";
  if (status === "RUNNING") return "Worker is processing";
  if (status === "CANCELLED") return "Cancelled";
  return "No outcome yet";
}

function runStateLabel(run: Pick<RasterRunRow, "outcome" | "status">) {
  if (run.outcome === "INFEASIBLE") return "INFEASIBLE";
  return run.status;
}

function runOutcomeLabel(outcome: string | null | undefined, status: string) {
  if (outcome === "INFEASIBLE") return "No feasible assignment";
  if (outcome === "FAILED") return "Software failure";
  if (outcome === "CANCELLED") return "Cancelled";
  if (outcome === "PROVEN_OPTIMAL") return "Proven optimal";
  if (outcome === "FEASIBLE") return "Feasible";
  return runStatusLabel(status);
}

function runStrategyLabel(settings: string | null | undefined) {
  try {
    const parsed = JSON.parse(settings ?? "{}") as { strategy?: unknown };
    if (parsed.strategy === "initial_heuristic") return "Initial heuristic";
    if (parsed.strategy === "manual") return "Manual";
    return "CP-SAT";
  } catch {
    return "CP-SAT";
  }
}

function formatRunTimestamp(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function RunPhaseBar({
  outcome,
  solverStatus,
  status,
  snapshotId,
}: {
  outcome?: string | null;
  solverStatus?: string | null;
  status: string;
  snapshotId?: string;
}) {
  const failed =
    status === "FAILED" ||
    status === "CANCELLED" ||
    outcome === "FAILED" ||
    outcome === "INFEASIBLE" ||
    outcome === "CANCELLED";
  const activeIndex =
    status === "PENDING"
      ? 0
      : status === "RUNNING"
        ? 1
        : snapshotId
          ? 2
          : failed
            ? 2
            : 0;
  const steps =
    outcome === "INFEASIBLE"
      ? ["Waiting for worker", "Optimization checked", "No feasible assignment"]
      : failed
        ? ["Waiting for worker", "Optimization started", "Failed"]
        : ["Waiting for worker", "Optimization started", "Results available"];
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-3 gap-1">
        {steps.map((step, index) => (
          <div
            aria-label={step}
            className={`h-2 rounded-sm ${
              failed && index === activeIndex
                ? "bg-red-500/80"
                : index <= activeIndex
                  ? "bg-[var(--primary)]"
                  : "bg-[var(--border)]"
            }`}
            key={step}
          />
        ))}
      </div>
      <div className="flex justify-between gap-2 text-xs text-[var(--muted-foreground)]">
        {steps.map((step, index) => (
          <span
            className={
              index === activeIndex
                ? "font-medium text-[var(--foreground)]"
                : ""
            }
            key={step}
          >
            {step}
          </span>
        ))}
      </div>
      {failed ? (
        <p className="text-xs text-red-300">
          {solverStatus ||
            (outcome === "INFEASIBLE"
              ? "No feasible assignment exists with the current hard constraints."
              : "The optimizer failed because of a software or worker error.")}
        </p>
      ) : null}
    </div>
  );
}
