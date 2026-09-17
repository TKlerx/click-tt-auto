"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { BusyLabel } from "@/components/ui/busy-label";

type BaselineRow = {
  id: string;
  sourceGroupLabel: string;
  sourceTeamLabel: string;
  rasterzahl: number;
  status: string;
  targetTeamId: string | null;
  targetTeamLabel: string | null;
  issue: string | null;
};

type BaselineData = {
  active: null | {
    id: string;
    status: string;
    createdAt: Date | string;
    rows: BaselineRow[];
  };
  versions: Array<{
    id: string;
    status: string;
    active: boolean;
    createdAt: Date | string;
    counts: { total: number; review: number; invalid: number };
  }>;
  counts: {
    total: number;
    matched: number;
    review: number;
    ignored: number;
    acceptedUnresolved: number;
    invalid: number;
  };
};

export function BaselineReview({
  baseline,
  canEdit,
  inputSetId,
  teams,
}: {
  baseline: BaselineData;
  canEdit: boolean;
  inputSetId: string;
  teams: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const unresolved =
    baseline.active?.rows.filter(
      (row) => row.status === "REVIEW" || row.status === "INVALID",
    ) ?? [];

  async function refresh() {
    setBusy("import");
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/baseline`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessage(
        response.ok
          ? "Manual baseline imported."
          : (body.error ?? `Import failed (${response.status})`),
      );
      if (response.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function decide(
    rowId: string,
    decision: "map" | "ignore" | "accept-unresolved",
    targetTeamId?: string,
  ) {
    setBusy(rowId);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${inputSetId}/baseline/rows/${rowId}`,
        ),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            targetTeamId ? { decision, targetTeamId } : { decision },
          ),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessage(
        response.ok
          ? "Baseline decision saved."
          : (body.error ?? `Save failed (${response.status})`),
      );
      if (response.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <details
      className="mt-3 border-t border-[var(--border)] pt-3"
      open={unresolved.length > 0}
    >
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Manual baseline ({baseline.active?.status ?? "not imported"})
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{baseline.counts.total} rows</span>
          <span>{baseline.counts.matched} matched</span>
          <span>
            {baseline.counts.review + baseline.counts.invalid} to review
          </span>
          {canEdit ? (
            <button
              className="h-9 rounded-md border border-[var(--border)] px-3 font-medium"
              disabled={busy !== null}
              onClick={() => void refresh()}
              type="button"
            >
              {busy === "import" ? (
                <BusyLabel label="Importing" />
              ) : baseline.active ? (
                "Refresh baseline"
              ) : (
                "Import baseline"
              )}
            </button>
          ) : null}
          {message ? (
            <span className="text-[var(--muted-foreground)]">{message}</span>
          ) : null}
        </div>
        {unresolved.map((row) => (
          <div
            className="grid gap-2 rounded-md border border-[var(--border)] p-3 text-sm md:grid-cols-[minmax(12rem,1fr)_5rem_minmax(12rem,1fr)_auto]"
            key={row.id}
          >
            <span>
              <strong>{row.sourceTeamLabel}</strong>
              <br />
              <span className="text-[var(--muted-foreground)]">
                {row.sourceGroupLabel}: {row.issue}
              </span>
            </span>
            <span>RZ {row.rasterzahl}</span>
            {canEdit ? (
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2"
                defaultValue=""
                id={`baseline-target-${row.id}`}
              >
                <option value="">Select target team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.label}
                  </option>
                ))}
              </select>
            ) : (
              <span>{row.targetTeamLabel ?? "Unresolved"}</span>
            )}
            {canEdit ? (
              <span className="flex flex-wrap gap-2">
                <button
                  className="h-9 rounded-md border border-[var(--border)] px-3"
                  disabled={busy !== null}
                  onClick={() => {
                    const target = document.querySelector<HTMLSelectElement>(
                      `#baseline-target-${CSS.escape(row.id)}`,
                    )?.value;
                    if (target) void decide(row.id, "map", target);
                  }}
                  type="button"
                >
                  Map
                </button>
                <button
                  className="h-9 rounded-md border border-[var(--border)] px-3"
                  disabled={busy !== null}
                  onClick={() => void decide(row.id, "ignore")}
                  type="button"
                >
                  Ignore
                </button>
                <button
                  className="h-9 rounded-md border border-[var(--border)] px-3"
                  disabled={busy !== null}
                  onClick={() => void decide(row.id, "accept-unresolved")}
                  type="button"
                >
                  Accept
                </button>
              </span>
            ) : null}
          </div>
        ))}
        {baseline.versions.length ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Version history ({baseline.versions.length})
            </summary>
            <ul className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
              {baseline.versions.map((version) => (
                <li key={version.id}>
                  {new Date(version.createdAt).toLocaleString()} —{" "}
                  {version.status}, {version.counts.total} rows
                  {version.active ? " (active)" : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </details>
  );
}
