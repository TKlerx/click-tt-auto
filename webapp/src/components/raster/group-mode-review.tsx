"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  async function save(
    group: GroupModeReviewRow,
    rasterMode: "single" | "double",
  ) {
    setSavingId(group.groupId);
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
      if (!response.ok) throw new Error("Group mode update failed");
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  if (!groups.length) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
      {groups.map((group) => (
        <label
          key={`${group.inputSetId}:${group.groupId}`}
          className="grid grid-cols-[minmax(10rem,1fr)_12rem] items-center gap-3 text-sm"
        >
          <span>{group.label}</span>
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            defaultValue={group.rasterMode ?? ""}
            disabled={savingId === group.groupId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "single" || value === "double")
                void save(group, value);
            }}
          >
            <option value="" disabled>
              Select mode
            </option>
            <option value="single">Normal 6er</option>
            <option value="double">6er Doppelrunde</option>
          </select>
        </label>
      ))}
    </div>
  );
}
