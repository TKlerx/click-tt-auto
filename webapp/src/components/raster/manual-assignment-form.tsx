"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type ManualAssignmentTeamRow = {
  teamId: string;
  label: string;
};

export function ManualAssignmentForm({
  inputSetId,
  teams,
}: {
  inputSetId: string;
  teams: ManualAssignmentTeamRow[];
}) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const template = useMemo(
    () => teams.map((team) => `${team.label}\t`).join("\n"),
    [teams],
  );

  async function createDraft(formData: FormData) {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/manual-assignments`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: String(formData.get("name") ?? ""),
            paste: String(formData.get("paste") ?? ""),
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        draft?: { id: string; validationIssuesJson?: string };
        error?: string;
      };
      if (!response.ok || !body.draft) {
        setMessage(body.error ?? `Save failed (${response.status})`);
        return;
      }
      setDraftId(body.draft.id);
      setMessage(issueMessage(body.draft.validationIssuesJson, "Draft saved."));
    } finally {
      setBusy(null);
    }
  }

  async function postDraft(action: "validate" | "score") {
    if (!draftId) return;
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/manual-assignments/${draftId}/${action}`),
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        issues?: unknown[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(
          body.issues?.length
            ? `${body.error}: ${body.issues.length} issue(s).`
            : (body.error ?? `${action} failed (${response.status})`),
        );
        return;
      }
      setMessage(
        action === "score"
          ? "Manual plan scored. It is now available for comparison."
          : `Validation passed${body.issues?.length ? ` with ${body.issues.length} issue(s)` : ""}.`,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        Manual schedule-number plan
      </summary>
      <form action={createDraft} className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Plan name
          <input
            className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 font-normal"
            defaultValue="Manual plan"
            name="name"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Teams and schedule numbers
          <textarea
            className="min-h-40 rounded-md border border-[var(--border)] bg-transparent p-3 font-mono text-xs font-normal"
            defaultValue={template}
            name="paste"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            disabled={busy !== null}
            type="submit"
          >
            {busy === "save" ? "..." : "Save draft"}
          </button>
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
            disabled={busy !== null || !draftId}
            onClick={() => void postDraft("validate")}
            type="button"
          >
            Validate
          </button>
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium disabled:opacity-50"
            disabled={busy !== null || !draftId}
            onClick={() => void postDraft("score")}
            type="button"
          >
            Score
          </button>
          {message ? (
            <span className="text-sm text-[var(--muted-foreground)]">
              {message}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

function issueMessage(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  try {
    const issues = JSON.parse(value) as unknown[];
    return issues.length
      ? `Draft saved with ${issues.length} issue(s).`
      : fallback;
  } catch {
    return fallback;
  }
}
