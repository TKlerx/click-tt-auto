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
  season: string;
  contentHash: string | null;
  parsedJson: string | null;
  updatedAt: Date | string;
};

type RasterScopeOption = {
  code: string;
  name: string;
};

export function RasterSourcesPanel({
  district,
  season,
  scopes,
  sources,
  canEdit,
}: {
  district: string;
  season: string;
  scopes: RasterScopeOption[];
  sources: RasterSourceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [savingParsedId, setSavingParsedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sourceMessages, setSourceMessages] = useState<Record<string, string>>(
    {},
  );

  async function submitLink(formData: FormData) {
    setMessage(null);
    const payload = {
      scopeCode: String(formData.get("scopeCode") ?? ""),
      season: String(formData.get("season") ?? ""),
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
    const body = (await response.json().catch(() => ({}))) as {
      sources?: unknown[];
    };
    const count = body.sources?.length ?? 1;
    setMessage(count === 1 ? "Uploaded 1 source" : `Uploaded ${count} sources`);
    router.refresh();
  }

  async function refreshSource(sourceId: string) {
    setRefreshingId(sourceId);
    setMessage(null);
    setSourceMessages((messages) => ({
      ...messages,
      [sourceId]: "Parsing...",
    }));
    try {
      const response = await fetch(
        withBasePath(`/api/raster/sources/${sourceId}/refresh`),
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: string;
      };
      if (!response.ok) {
        setSourceMessages((messages) => ({
          ...messages,
          [sourceId]: body.error ?? `Parse failed (${response.status})`,
        }));
        return;
      }
      setSourceMessages((messages) => ({
        ...messages,
        [sourceId]: body.summary ?? "Parsed",
      }));
      router.refresh();
    } finally {
      setRefreshingId(null);
    }
  }

  async function deleteSource(sourceId: string, displayName: string) {
    if (!window.confirm(`Delete ${displayName}?`)) return;
    setDeletingId(sourceId);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/sources/${sourceId}`),
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Delete failed (${response.status})`);
        return;
      }
      setMessage("Deleted");
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function saveParsedJson(sourceId: string, formData: FormData) {
    setSavingParsedId(sourceId);
    setMessage(null);
    try {
      const response = await fetch(withBasePath(`/api/raster/sources/${sourceId}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parsedJson: String(formData.get("parsedJson") ?? ""),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Save failed (${response.status})`);
        return;
      }
      setMessage("Parsed data saved");
      router.refresh();
    } finally {
      setSavingParsedId(null);
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
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[10rem_minmax(12rem,1fr)_8rem_12rem_7rem_7rem]"
            >
              <span className="font-medium">
                {source.sourceType} {source.season}
              </span>
              <span className="break-all">{source.displayName}</span>
              <span
                className={
                  source.parsedJson
                    ? "text-[var(--primary)]"
                    : "text-[var(--muted-foreground)]"
                }
              >
                {source.parsedJson ? "Parsed" : "Needs parse"}
              </span>
              <span className="text-[var(--muted-foreground)]">
                {new Date(source.updatedAt).toLocaleDateString()}
              </span>
              {canEdit ? (
                <button
                  aria-label={`Parse ${source.displayName}`}
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  disabled={refreshingId === source.id}
                  onClick={() => void refreshSource(source.id)}
                  type="button"
                >
                  {refreshingId === source.id ? "..." : "Parse"}
                </button>
              ) : null}
              {canEdit ? (
                <button
                  aria-label={`Delete ${source.displayName}`}
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  disabled={deletingId === source.id}
                  onClick={() =>
                    void deleteSource(source.id, source.displayName)
                  }
                  type="button"
                >
                  {deletingId === source.id ? "..." : "Delete"}
                </button>
              ) : null}
              <a
                className="break-all text-[var(--primary)] md:col-span-6"
                href={source.sourceRef}
                rel="noreferrer"
                target="_blank"
              >
                {source.sourceRef}
              </a>
              {sourceMessages[source.id] ? (
                <p className="text-sm text-[var(--muted-foreground)] md:col-span-6">
                  {sourceMessages[source.id]}
                </p>
              ) : null}
              {source.parsedJson ? (
                <details className="md:col-span-6">
                  <summary className="cursor-pointer text-sm font-medium">
                    Parsed data: {parsedSourceSummary(source.parsedJson)}
                  </summary>
                  {canEdit ? (
                    <form
                      action={(formData) =>
                        void saveParsedJson(source.id, formData)
                      }
                      className="mt-2 grid gap-2"
                    >
                      <textarea
                        className="min-h-80 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs"
                        name="parsedJson"
                        defaultValue={formatParsedJson(source.parsedJson)}
                      />
                      <button
                        className="h-9 w-fit rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                        disabled={savingParsedId === source.id}
                        type="submit"
                      >
                        {savingParsedId === source.id
                          ? "..."
                          : "Save parsed data"}
                      </button>
                    </form>
                  ) : (
                    <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                      {formatParsedJson(source.parsedJson)}
                    </pre>
                  )}
                </details>
              ) : null}
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
          <form
            action={uploadSource}
            className="hidden gap-3 rounded-lg border border-[var(--border)] p-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <h3 className="text-sm font-semibold">
                1. Upload group assignment
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Upload one current group assignment file. Store it under a
                parent district if sub-districts should inherit it.
              </p>
            </div>
            <input name="season" type="hidden" value={season} />
            <input name="sourceType" type="hidden" value="GROUP_ASSIGNMENT" />
            <label className="grid gap-1 text-sm font-medium">
              Store source under
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                defaultValue={district}
                name="scopeCode"
              >
                {scopes.map((scope) => (
                  <option key={scope.code} value={scope.code}>
                    {scope.code} - {scope.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Display name
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="displayName"
                placeholder="Example: WTTV group assignment 2026"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">
              File
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-normal"
                name="file"
                required
                type="file"
              />
            </label>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Upload group assignment
            </button>
          </form>
          <form
            action={uploadSource}
            className="grid gap-3 rounded-lg border border-[var(--border)] p-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <h3 className="text-sm font-semibold">Upload wish PDFs</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Upload one or more wish PDFs. Each selected file becomes its own
                wish source and will be combined during validation.
              </p>
            </div>
            <input name="season" type="hidden" value={season} />
            <input name="sourceType" type="hidden" value="WISHES_PDF" />
            <label className="grid gap-1 text-sm font-medium">
              Store source under
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                defaultValue={district}
                name="scopeCode"
              >
                {scopes.map((scope) => (
                  <option key={scope.code} value={scope.code}>
                    {scope.code} - {scope.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Files
              <input
                accept="application/pdf,.pdf"
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                multiple
                name="file"
                required
                type="file"
              />
            </label>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Upload wish PDFs
            </button>
          </form>
          <details className="rounded-lg border border-[var(--border)] p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Advanced: register external source
            </summary>
            <form action={submitLink} className="mt-4 grid gap-3 md:grid-cols-2">
              <input name="season" type="hidden" value={season} />
              <p className="text-sm text-[var(--muted-foreground)] md:col-span-2">
                Paste a normal click-TT league page URL instead of uploading a
                file here.
              </p>
              <label className="grid gap-1 text-sm font-medium">
                Store source under
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                  defaultValue={district}
                  name="scopeCode"
                >
                  {scopes.map((scope) => (
                    <option key={scope.code} value={scope.code}>
                      {scope.code} - {scope.name}
                    </option>
                  ))}
                </select>
              </label>
              <input name="sourceType" type="hidden" value="GROUP_ASSIGNMENT" />
              <label className="grid gap-1 text-sm font-medium md:col-span-2">
                Display name
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                  name="displayName"
                  placeholder="Example: WTTV group assignment 2026"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">
                URL or document id
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                  name="sourceRef"
                  placeholder="https://wttv.click-tt.de/.../leaguePage?championship=WTTV%2026/27"
                  required
                />
              </label>
              <details className="space-y-3 md:col-span-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Raw metadata
                </summary>
                <label className="mt-3 grid gap-1 text-sm font-medium">
                  Content hash
                  <input
                    className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                    name="contentHash"
                    placeholder="Optional checksum"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Parsed JSON
                  <textarea
                    className="min-h-24 rounded-md border border-[var(--border)] bg-transparent p-3 text-sm font-normal"
                    name="parsedJson"
                    placeholder="Optional pre-parsed source payload"
                  />
                </label>
              </details>
              <button
                className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
                type="submit"
              >
                Save external source
              </button>
            </form>
          </details>
          {message ? (
            <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function parsedSourceSummary(parsedJson: string) {
  try {
    const parsed = JSON.parse(parsedJson) as {
      assignments?: unknown[];
      clubs?: unknown[];
      teams?: unknown[];
      wishes?: unknown[];
    };
    return (
      [
        countLabel(parsed.assignments, "assignment"),
        countLabel(parsed.clubs, "club"),
        countLabel(parsed.teams, "team"),
        countLabel(parsed.wishes, "wish"),
      ]
        .filter(Boolean)
        .join(", ") || "saved"
    );
  } catch {
    return "saved";
  }
}

function formatParsedJson(parsedJson: string) {
  try {
    return JSON.stringify(JSON.parse(parsedJson), null, 2);
  } catch {
    return parsedJson;
  }
}

function countLabel(rows: unknown[] | undefined, label: string) {
  if (!rows?.length) return null;
  return `${rows.length} ${label}${rows.length === 1 ? "" : "s"}`;
}
