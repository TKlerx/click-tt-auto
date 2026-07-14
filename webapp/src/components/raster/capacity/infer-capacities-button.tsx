"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { BusyLabel } from "@/components/ui/busy-label";

export function InferCapacitiesButton({
  inputSetId,
  label,
}: {
  inputSetId: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function infer() {
    setBusy(true);
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
        setMessage(body.error ?? `Failed (${response.status})`);
        return;
      }
      setMessage(
        `Inferred ${body.result?.count ?? 0}; ${body.result?.needsReview ?? 0} need review.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
        disabled={busy}
        onClick={() => void infer()}
        type="button"
      >
        {busy ? <BusyLabel label="Inferring" /> : label}
      </button>
      {message ? (
        <span className="text-sm text-[var(--muted-foreground)]">
          {message}
        </span>
      ) : null}
    </div>
  );
}
