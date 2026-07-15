"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

export function ImportSnapshotForm({ scope }: { scope: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const rawJson = String(formData.get("json") ?? "");
    let payload: unknown;
    try {
      payload = JSON.parse(rawJson);
    } catch {
      setMessage("Import failed: invalid JSON");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      setMessage("Import failed: expected a JSON object");
      return;
    }

    const response = await fetch(withBasePath("/api/raster/snapshots/import"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, ...(payload as object) }),
    });
    if (response.ok) {
      setMessage("Imported");
      return;
    }

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setMessage(`Import failed: ${body.error ?? response.status}`);
  }

  return (
    <form action={submit} className="space-y-3">
      <textarea
        className="min-h-40 w-full rounded border border-[var(--border)] bg-transparent p-3 text-sm"
        name="json"
      />
      <button
        className="rounded border border-[var(--border)] px-3 py-2 text-sm"
        type="submit"
      >
        Import
      </button>
      {message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </form>
  );
}
