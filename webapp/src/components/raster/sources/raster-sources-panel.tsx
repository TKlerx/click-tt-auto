"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

type RasterSourceRow = {
  id: string;
  scopeId: string;
  sourceType: string;
  sourceRef: string;
  displayName: string;
  contentHash: string | null;
  parsedJson: string | null;
  updatedAt: Date | string;
};

export function RasterSourcesPanel({
  district,
  sources,
  canEdit,
}: {
  district: string;
  sources: RasterSourceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  async function submitLink(formData: FormData) {
    setMessage(null);
    const payload = {
      scopeCode: String(formData.get("scopeCode") ?? ""),
      sourceType: String(formData.get("sourceType") ?? ""),
      sourceRef: String(formData.get("sourceRef") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      contentHash: String(formData.get("contentHash") ?? "") || undefined,
      parsedJson: String(formData.get("parsedJson") ?? "") || undefined,
    };
    const response = await fetch(withBasePath("/api/raster/sources"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
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

  async function uploadSource(formData: FormData) {
    setMessage(null);
    const response = await fetch(withBasePath("/api/raster/sources/upload"), {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessage(body.error ?? `Upload failed (${response.status})`);
      return;
    }
    setMessage("Uploaded");
    router.refresh();
  }

  async function refreshSource(sourceId: string) {
    setRefreshingId(sourceId);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/sources/${sourceId}/refresh`),
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Refresh failed (${response.status})`);
        return;
      }
      setMessage("Refreshed");
      router.refresh();
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Sources
        </h2>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {sources.length ? (
          sources.map((source) => (
            <div
              key={source.id}
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[10rem_minmax(12rem,1fr)_12rem_7rem]"
            >
              <span className="font-medium">{source.sourceType}</span>
              <span className="break-all">{source.displayName}</span>
              <span className="text-[var(--muted-foreground)]">
                {new Date(source.updatedAt).toLocaleDateString()}
              </span>
              {canEdit ? (
                <button
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  disabled={refreshingId === source.id}
                  onClick={() => void refreshSource(source.id)}
                  type="button"
                >
                  {refreshingId === source.id ? "..." : "Refresh"}
                </button>
              ) : null}
              <a
                className="break-all text-[var(--primary)] md:col-span-4"
                href={source.sourceRef}
                rel="noreferrer"
                target="_blank"
              >
                {source.sourceRef}
              </a>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No sources for {district}.
          </p>
        )}
      </div>
      {canEdit ? (
        <div className="space-y-4 border-t border-[var(--border)] p-4">
        <form action={uploadSource} className="grid gap-3 md:grid-cols-2">
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
            defaultValue="WTTV"
            name="scopeCode"
            placeholder="Scope"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
            defaultValue="GROUP_ASSIGNMENT"
            name="sourceType"
            placeholder="Type"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm md:col-span-2"
            name="displayName"
            placeholder="Name"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm md:col-span-2"
            name="file"
            type="file"
          />
          <button
            className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            type="submit"
          >
            Upload
          </button>
        </form>
        <form action={submitLink} className="grid gap-3 md:grid-cols-2">
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
            defaultValue="WTTV"
            name="scopeCode"
            placeholder="Scope"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
            defaultValue="GROUP_ASSIGNMENT"
            name="sourceType"
            placeholder="Type"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm md:col-span-2"
            name="displayName"
            placeholder="Name"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm md:col-span-2"
            name="sourceRef"
            placeholder="URL or document id"
          />
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm md:col-span-2"
            name="contentHash"
            placeholder="Content hash"
          />
          <textarea
            className="min-h-24 rounded-md border border-[var(--border)] bg-transparent p-3 text-sm md:col-span-2"
            name="parsedJson"
            placeholder="Parsed JSON"
          />
          <div className="flex items-center gap-3 md:col-span-2">
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Save
            </button>
            {message ? (
              <span className="text-sm text-[var(--muted-foreground)]">
                {message}
              </span>
            ) : null}
          </div>
        </form>
        </div>
      ) : null}
    </section>
  );
}
