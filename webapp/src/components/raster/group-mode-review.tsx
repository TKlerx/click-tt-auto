"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type GroupModeReviewRow = {
  inputSetId: string;
  groupId: string;
  label: string;
  rasterMode: "single" | "double" | null;
};

export function GroupModeReview({ groups }: { groups: GroupModeReviewRow[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, "single" | "double" | "">>(
    {},
  );

  useEffect(() => {
    setValues(
      Object.fromEntries(
        groups.map((group) => [group.groupId, group.rasterMode ?? ""]),
      ),
    );
  }, [groups]);

  async function save(group: GroupModeReviewRow) {
    const rasterMode = values[group.groupId];
    if (rasterMode !== "single" && rasterMode !== "double") {
      setMessages((current) => ({
        ...current,
        [group.groupId]: "Choose a mode",
      }));
      return;
    }
    setSavingId(group.groupId);
    setMessages((current) => ({ ...current, [group.groupId]: "Saving..." }));
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/groups/${encodeURIComponent(group.groupId)}`,
        ),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rasterMode }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Group mode update failed");
      }
      setMessages((current) => ({ ...current, [group.groupId]: "Saved" }));
      router.refresh();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [group.groupId]: error instanceof Error ? error.message : "Save failed",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    setSavingId("__all__");
    for (const group of groups) {
      const rasterMode = values[group.groupId];
      if (rasterMode !== "single" && rasterMode !== "double") {
        setMessages((current) => ({
          ...current,
          [group.groupId]: "Choose a mode",
        }));
        setSavingId(null);
        return;
      }
    }
    try {
      for (const group of groups) {
        await save(group);
      }
    } finally {
      setSavingId(null);
    }
  }

  if (!groups.length) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Six-team group mode</h3>
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            disabled={savingId !== null}
            onClick={() => void saveAll()}
            type="button"
          >
            Save all
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Choose whether each 6-team group uses the normal 6er schedule or a
          6er Doppelrunde, then validate again.
        </p>
      </div>
      {groups.map((group) => (
        <div
          key={`${group.inputSetId}:${group.groupId}`}
          className="grid grid-cols-[minmax(10rem,1fr)_12rem_5rem_7rem] items-center gap-3 text-sm"
        >
          <span>{group.label}</span>
          <select
            data-group-id={group.groupId}
            data-input-set-id={group.inputSetId}
            data-raster-group-mode=""
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={values[group.groupId] ?? group.rasterMode ?? ""}
            disabled={savingId === group.groupId || savingId === "__all__"}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "single" || value === "double" || value === "") {
                setValues((current) => ({
                  ...current,
                  [group.groupId]: value,
                }));
              }
            }}
          >
            <option value="" disabled>
              Select mode
            </option>
            <option value="single">Normal 6er</option>
            <option value="double">6er Doppelrunde</option>
          </select>
          <button
            className="h-9 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
            disabled={savingId === group.groupId || savingId === "__all__"}
            onClick={() => void save(group)}
            type="button"
          >
            Save
          </button>
          <span className="text-xs text-[var(--muted-foreground)]">
            {messages[group.groupId] ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}
