"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import {
  RunSettingsFields,
  type RasterRunStrategy,
} from "@/components/raster/run-controls";

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
  settings?: string | null;
  createdAt: Date | string;
  finishedAt: Date | string | null;
  snapshot: { id: string } | null;
};

type HallCapacityReview = {
  inferredCount: number;
  missingCount: number;
  insufficientCount: number;
  blockingCount: number;
  rows: Array<{
    id: string | null;
    district: string;
    clubId: string;
    hall: string;
    weekday: string;
    capacity: number;
    storedCapacity: number | null;
    basis: string | null;
    status: "missing" | "insufficient";
  }>;
};

export function CreateInputSetForm({
  district,
  season,
}: {
  district: string;
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
        district,
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
          defaultValue={`${district} ${season}`}
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
}: {
  inputSetId: string;
  status: string;
  runs: RasterRunRow[];
  capacityReview?: HallCapacityReview;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<RasterRunStrategy>("cp_sat");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300);
  const capacityBlocked = (capacityReview?.blockingCount ?? 0) > 0;

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
      setMessage("Cancelled");
      router.refresh();
    } finally {
      setBusy(null);
    }
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
        setMessage(body.error ?? `Capacity inference failed (${response.status})`);
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

  async function saveCapacity(row: HallCapacityReview["rows"][number], formData: FormData) {
    if (!row.id) return;
    setBusy(row.id);
    setMessage(null);
    try {
      const response = await fetch(withBasePath(`/api/raster/capacity/${row.id}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          district: row.district,
          capacity: Number(formData.get("capacity")),
          basis: "REVIEWED",
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Capacity save failed (${response.status})`);
        return;
      }
      setMessage("Capacity saved. Validate again.");
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
          {busy === "Validate" ? "..." : "Validate"}
        </button>
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
          disabled={busy !== null || status !== "READY" || capacityBlocked}
          onClick={() =>
            void post(`/api/raster/input-sets/${inputSetId}/runs`, "Run")
          }
          type="button"
        >
          {busy === "Run" ? "..." : "Queue run"}
        </button>
        {status !== "READY" ? (
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
                {busy === "Capacity" ? "..." : "Infer missing capacities"}
              </button>
            ) : null}
            <span className="text-sm text-[var(--muted-foreground)]">
              Capacity review needed: {capacityReview?.missingCount ?? 0}{" "}
              missing, {capacityReview?.insufficientCount ?? 0} lower than
              inferred.
            </span>
          </>
        ) : null}
        {message ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            {message}
          </span>
        ) : null}
        <button
          aria-label="Refresh runs"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)]"
          disabled={busy !== null}
          onClick={() => router.refresh()}
          title="Refresh runs"
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {capacityBlocked && capacityReview ? (
        <CapacityWizard
          busy={busy}
          onInfer={() => void inferCapacities()}
          onSave={(row, formData) => void saveCapacity(row, formData)}
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
                <span className="font-medium">{run.status}</span>
                <span>{run.outcome ?? runStatusLabel(run.status)}</span>
                <span className="text-[var(--muted-foreground)]">
                  {runStrategyLabel(run.settings)}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  {new Date(run.createdAt).toLocaleString()}
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
                  ) : null}
                </span>
              </div>
              <RunPhaseBar status={run.status} snapshotId={run.snapshot?.id} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CapacityWizard({
  busy,
  onInfer,
  onSave,
  review,
}: {
  busy: string | null;
  onInfer: () => void;
  onSave: (row: HallCapacityReview["rows"][number], formData: FormData) => void;
  review: HallCapacityReview;
}) {
  const missing = review.rows.filter((row) => row.status === "missing");
  const insufficient = review.rows.filter(
    (row) => row.status === "insufficient",
  );
  return (
    <details
      className="rounded-md border border-[var(--border)] p-3"
      open
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Hall capacity review
      </summary>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Confirm capacities before validation can pass. Stored equal or larger
        capacities are reused automatically.
      </p>
      {missing.length ? (
        <div className="mt-3 grid gap-2">
          <button
            className="h-9 w-fit rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            disabled={busy !== null}
            onClick={onInfer}
            type="button"
          >
            {busy === "Capacity" ? "..." : "Infer missing capacities"}
          </button>
          <CapacityRows rows={missing} />
        </div>
      ) : null}
      {insufficient.length ? (
        <div className="mt-3 grid gap-2">
          <p className="text-sm font-medium">Capacities lower than inferred</p>
          {insufficient.map((row) => (
            <form
              action={(formData) => onSave(row, formData)}
              className="grid gap-2 rounded-md border border-[var(--border)] p-2 md:grid-cols-[minmax(12rem,1fr)_5rem_7rem_auto]"
              key={row.id ?? `${row.clubId}-${row.hall}-${row.weekday}`}
            >
              <span className="text-sm">
                {row.clubId}, hall {row.hall}, {row.weekday}
              </span>
              <span className="text-sm text-[var(--muted-foreground)]">
                {row.storedCapacity ?? 0} to {row.capacity}
              </span>
              <input
                className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
                min={row.capacity}
                name="capacity"
                type="number"
                defaultValue={row.capacity}
              />
              <button
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                disabled={busy !== null}
                type="submit"
              >
                {busy === row.id ? "..." : "Save"}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function CapacityRows({ rows }: { rows: HallCapacityReview["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <tr>
            <th className="px-2 py-2">Club</th>
            <th className="px-2 py-2">Hall</th>
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

function RunPhaseBar({
  status,
  snapshotId,
}: {
  status: string;
  snapshotId?: string;
}) {
  const failed = status === "FAILED" || status === "CANCELLED";
  const activeIndex =
    status === "PENDING"
      ? 0
      : status === "RUNNING"
        ? 1
        : snapshotId
          ? 2
          : failed
            ? 1
            : 0;
  const steps = [
    "Waiting for worker",
    "Optimization started",
    "Results available",
  ];
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-3 gap-1">
        {steps.map((step, index) => (
          <div
            aria-label={step}
            className={`h-2 rounded-sm ${
              failed && index >= activeIndex
                ? "bg-red-500/70"
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
            {failed && index === activeIndex ? status.toLowerCase() : step}
          </span>
        ))}
      </div>
    </div>
  );
}
