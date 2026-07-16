"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import {
  RunSettingsFields,
  type RasterRunStrategy,
} from "@/components/raster/run-controls";

export function StartCombinedRunForm({
  name,
  scopeIds,
  season,
}: {
  name: string;
  scopeIds: string[];
  season: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [strategy, setStrategy] = useState<RasterRunStrategy>("cp_sat");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(300);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await fetch(withBasePath("/api/raster/combined"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scopeIds, season }),
      });
      const createBody = (await created.json().catch(() => ({}))) as {
        inputSet?: { id?: string };
        error?: string;
      };
      if (!created.ok || !createBody.inputSet?.id) {
        setMessage(createBody.error ?? `Create failed (${created.status})`);
        return;
      }
      const queued = await fetch(
        withBasePath(`/api/raster/combined/${createBody.inputSet.id}/runs`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ strategy, timeLimitSeconds }),
        },
      );
      const queueBody = (await queued.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!queued.ok) {
        setMessage(queueBody.error ?? `Queue failed (${queued.status})`);
        return;
      }
      setMessage("Run queued");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] p-3">
      <RunSettingsFields
        disabled={busy}
        setStrategy={setStrategy}
        setTimeLimitSeconds={setTimeLimitSeconds}
        strategy={strategy}
        timeLimitSeconds={timeLimitSeconds}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
          disabled={busy || scopeIds.length < 2}
          onClick={() => void start()}
          type="button"
        >
          {busy ? "Queueing..." : "Start combined run"}
        </button>
        {message ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
