"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

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
  createdAt: Date | string;
  finishedAt: Date | string | null;
  snapshot: { id: string } | null;
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
}: {
  inputSetId: string;
  status: string;
  runs: RasterRunRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
        body: "{}",
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

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
          disabled={busy !== null}
          onClick={() =>
            void post(`/api/raster/input-sets/${inputSetId}/validate`, "Validate")
          }
          type="button"
        >
          {busy === "Validate" ? "..." : "Validate"}
        </button>
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
          disabled={busy !== null || status !== "READY"}
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
        {message ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            {message}
          </span>
        ) : null}
      </div>
      {runs.length ? (
        <div className="grid gap-2 text-sm">
          {runs.some((run) => run.status === "PENDING" || run.status === "RUNNING") ? (
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
              <div className="grid gap-2 md:grid-cols-[9rem_12rem_minmax(8rem,1fr)_auto]">
                <span className="font-medium">{run.status}</span>
                <span>{run.outcome ?? runStatusLabel(run.status)}</span>
                <span className="text-[var(--muted-foreground)]">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
                <span className="flex gap-2">
                  {run.snapshot ? (
                    <a
                      className="text-[var(--primary)]"
                      href={withBasePath(`/raster/snapshots/${run.snapshot.id}`)}
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

function runStatusLabel(status: string) {
  if (status === "PENDING") return "Waiting for worker";
  if (status === "RUNNING") return "Worker is processing";
  if (status === "CANCELLED") return "Cancelled";
  return "No outcome yet";
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
            className={index === activeIndex ? "font-medium text-[var(--foreground)]" : ""}
            key={step}
          >
            {failed && index === activeIndex ? status.toLowerCase() : step}
          </span>
        ))}
      </div>
    </div>
  );
}
