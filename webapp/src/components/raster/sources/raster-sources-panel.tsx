"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { buildProjectionReviewRows } from "./source-projection";

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

type RasterInputSetRow = {
  id: string;
  name: string;
  seasonModelJson: string | null;
};

type UpperLeagueReview = {
  importPresent: boolean;
  matched: Array<{ clubId: string; label: string; rasterzahl: number }>;
  unmatched: Array<{ clubId: string; label: string }>;
  excludedNoHall: Array<{ clubId: string; label: string }>;
  invalidRasterzahl: Array<{
    clubId: string;
    label: string;
    rasterzahl: number;
    size: number;
  }>;
};

export function RasterSourcesPanel({
  scopeCode,
  season,
  sources,
  inputSet,
  upperLeagueReview,
  canEdit,
}: {
  scopeCode: string;
  season: string;
  sources: RasterSourceRow[];
  inputSet?: RasterInputSetRow | null;
  upperLeagueReview?: UpperLeagueReview | null;
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
    if (!inputSet) {
      setMessage("Create a planning workspace first.");
      return;
    }
    const payload = {
      scopeCode,
      season: String(formData.get("season") ?? ""),
      inputSetId: inputSet.id,
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
    if (!inputSet) {
      setMessage("Create a planning workspace first.");
      return;
    }
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
      const response = await fetch(
        withBasePath(`/api/raster/sources/${sourceId}`),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parsedJson: String(formData.get("parsedJson") ?? ""),
          }),
        },
      );
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
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {scopeCode} · {season}
          {inputSet ? ` · ${inputSet.name}` : ""}
        </p>
      </div>
      {canEdit && inputSet ? (
        <div className="grid gap-3 border-b border-[var(--border)] p-4 md:grid-cols-3">
          <form action={submitLink} className="grid gap-3">
            <input name="season" type="hidden" value={season} />
            <input name="sourceType" type="hidden" value="GROUP_ASSIGNMENT" />
            <label className="grid gap-1 text-sm font-medium">
              click-TT group URL
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="sourceRef"
                placeholder="https://wttv.click-tt.de/.../leaguePage"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Display name
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="displayName"
                placeholder={`${scopeCode} group assignment ${season}`}
                required
              />
            </label>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Save URL
            </button>
          </form>
          <form action={uploadSource} className="grid gap-3">
            <input name="scopeCode" type="hidden" value={scopeCode} />
            <input name="season" type="hidden" value={season} />
            <input name="inputSetId" type="hidden" value={inputSet.id} />
            <input name="sourceType" type="hidden" value="WISHES_PDF" />
            <label className="grid gap-1 text-sm font-medium">
              Wish PDFs
              <input
                accept="application/pdf,.pdf"
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                multiple
                name="file"
                required
                type="file"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Display name
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="displayName"
                placeholder={`${scopeCode} wishes ${season}`}
              />
            </label>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Upload PDFs
            </button>
          </form>
          <form action={uploadSource} className="grid gap-3">
            <input name="scopeCode" type="hidden" value={scopeCode} />
            <input name="season" type="hidden" value={season} />
            <input name="inputSetId" type="hidden" value={inputSet.id} />
            <input name="sourceType" type="hidden" value="UPPER_LEAGUE_RASTER" />
            <label className="grid gap-1 text-sm font-medium">
              Upper-league raster PDF
              <input
                accept="application/pdf,.pdf"
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="file"
                required
                type="file"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Display name
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                name="displayName"
                placeholder={`${scopeCode} upper-league raster ${season}`}
              />
            </label>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Upload raster PDF
            </button>
          </form>
          {message ? (
            <p className="text-sm text-[var(--muted-foreground)] md:col-span-3">
              {message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {canEdit
            ? "Create a planning workspace before adding sources."
            : "Read-only access: create, add, and parse actions are unavailable."}
        </p>
      )}
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
                  {source.sourceType.toUpperCase() === "WISHES_PDF" ? (
                    <ProjectionReview
                      inputSet={inputSet}
                      sourceJson={source.parsedJson}
                    />
                  ) : null}
                  {source.sourceType.toUpperCase() ===
                  "UPPER_LEAGUE_RASTER" ? (
                    <UpperLeaguePreview
                      review={upperLeagueReview}
                      sourceJson={source.parsedJson}
                    />
                  ) : null}
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
            No sources for {scopeCode}.
          </p>
        )}
      </div>
    </section>
  );
}

function UpperLeaguePreview({
  review,
  sourceJson,
}: {
  review?: UpperLeagueReview | null;
  sourceJson: string;
}) {
  const parsed = parseJson<{
    leagues?: Array<{
      league?: string;
      size?: number;
      entries?: Array<{ team?: string; rasterzahl?: number }>;
    }>;
  }>(sourceJson);
  const leagues = parsed?.leagues ?? [];
  if (!leagues.length) return null;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-[var(--border)] p-3">
      <div className="overflow-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-[var(--muted-foreground)]">
            <tr>
              <th className="py-2 pr-3 font-medium">League</th>
              <th className="py-2 pr-3 font-medium">Size</th>
              <th className="py-2 pr-3 font-medium">First entries</th>
            </tr>
          </thead>
          <tbody>
            {leagues.map((league, index) => (
              <tr
                className="border-t border-[var(--border)]"
                key={`${league.league ?? "league"}-${index}`}
              >
                <td className="py-2 pr-3">{league.league}</td>
                <td className="py-2 pr-3">{league.size}</td>
                <td className="py-2 pr-3">
                  {(league.entries ?? [])
                    .slice(0, 5)
                    .map((entry) => `${entry.rasterzahl} ${entry.team}`)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {review ? <UpperLeagueMatchReview review={review} /> : null}
    </div>
  );
}

function UpperLeagueMatchReview({ review }: { review: UpperLeagueReview }) {
  return (
    <div className="grid gap-3 text-xs md:grid-cols-4">
      <UpperLeagueReviewList
        rows={review.matched.map((row) => ({
          label: `${row.clubId} / ${row.label}`,
          detail: String(row.rasterzahl),
        }))}
        title={`Matched (${review.matched.length})`}
      />
      <UpperLeagueReviewList
        rows={review.unmatched.map((row) => ({
          label: `${row.clubId} / ${row.label}`,
        }))}
        title={`Unmatched (${review.unmatched.length})`}
      />
      <UpperLeagueReviewList
        rows={review.excludedNoHall.map((row) => ({
          label: `${row.clubId} / ${row.label}`,
        }))}
        title={`Excluded no hall (${review.excludedNoHall.length})`}
      />
      <UpperLeagueReviewList
        rows={(review.invalidRasterzahl ?? []).map((row) => ({
          label: `${row.clubId} / ${row.label}`,
          detail: `${row.rasterzahl}/${row.size}`,
        }))}
        title={`Invalid Rasterzahl (${review.invalidRasterzahl?.length ?? 0})`}
      />
    </div>
  );
}

function UpperLeagueReviewList({
  rows,
  title,
}: {
  rows: Array<{ label: string; detail?: string }>;
  title: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <h4 className="font-medium">{title}</h4>
      {rows.length ? (
        <ul className="mt-2 grid gap-1 text-[var(--muted-foreground)]">
          {rows.slice(0, 8).map((row, index) => (
            <li className="flex justify-between gap-2" key={`${row.label}-${index}`}>
              <span className="break-words">{row.label}</span>
              {row.detail ? <span>{row.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[var(--muted-foreground)]">None</p>
      )}
    </div>
  );
}

function ProjectionReview({
  inputSet,
  sourceJson,
}: {
  inputSet?: RasterInputSetRow | null;
  sourceJson: string;
}) {
  const rows = buildProjectionReviewRows(
    sourceJson,
    inputSet?.seasonModelJson ?? null,
  );
  if (!inputSet?.seasonModelJson) {
    return (
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        No input set model to compare against yet.
      </p>
    );
  }
  if (!rows.length) return null;

  return (
    <details className="mt-3 rounded-md border border-[var(--border)] p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Projection review against {inputSet.name}:{" "}
        {rows.filter((row) => row.status === "missing").length} unmatched
      </summary>
      <div className="mt-3 overflow-auto">
        <table className="w-full min-w-[52rem] text-left text-xs">
          <thead className="text-[var(--muted-foreground)]">
            <tr>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">PDF club</th>
              <th className="py-2 pr-3 font-medium">PDF team</th>
              <th className="py-2 pr-3 font-medium">Parsed</th>
              <th className="py-2 pr-3 font-medium">Matched id</th>
              <th className="py-2 pr-3 font-medium">Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t border-[var(--border)]" key={index}>
                <td className="py-2 pr-3">
                  {row.status === "matched" ? "matched" : "missing"}
                </td>
                <td className="py-2 pr-3">{row.sourceClub}</td>
                <td className="py-2 pr-3">{row.sourceTeam}</td>
                <td className="py-2 pr-3">{row.parsed}</td>
                <td className="py-2 pr-3">{row.matchedTeam || "-"}</td>
                <td className="py-2 pr-3">{row.applied || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function parsedSourceSummary(parsedJson: string) {
  try {
    const parsed = JSON.parse(parsedJson) as {
      assignments?: unknown[];
      clubs?: unknown[];
      teams?: unknown[];
      wishes?: unknown[];
      leagues?: unknown[];
    };
    return (
      [
        countLabel(parsed.assignments, "assignment"),
        countLabel(parsed.clubs, "club"),
        countLabel(parsed.teams, "team"),
        countLabel(parsed.wishes, "wish"),
        countLabel(parsed.leagues, "league"),
      ]
        .filter(Boolean)
        .join(", ") || "saved"
    );
  } catch {
    return "saved";
  }
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
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
