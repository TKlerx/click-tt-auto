"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type CapacityRow = {
  id: string;
  district: string;
  clubId: string;
  hall: string;
  weekday: string;
  capacity: number;
  basis: string;
};

export function CapacityTable({
  canEdit = false,
  rows,
}: {
  canEdit?: boolean;
  rows: CapacityRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(row: CapacityRow, formData: FormData) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const response = await fetch(withBasePath(`/api/raster/capacity/${row.id}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          district: row.district,
          capacity: Number(formData.get("capacity")),
          basis: "REVIEWED",
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Save failed (${response.status})`);
        return;
      }
      setMessage("Capacity saved");
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        No capacity rows.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Club</th>
              <th className="px-3 py-2">Hall</th>
              <th className="px-3 py-2">Day</th>
              <th className="px-3 py-2">Capacity</th>
              <th className="px-3 py-2">Basis</th>
              {canEdit ? <th className="px-3 py-2">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border)] last:border-b-0"
              >
                <td className="px-3 py-2">{row.clubId}</td>
                <td className="px-3 py-2">{row.hall}</td>
                <td className="px-3 py-2">{row.weekday}</td>
                <td className="px-3 py-2 font-semibold">
                  {canEdit ? (
                    <input
                      className="h-9 w-20 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
                      defaultValue={row.capacity}
                      form={`capacity-${row.id}`}
                      min={0}
                      name="capacity"
                      type="number"
                    />
                  ) : (
                    row.capacity
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                    {row.basis}
                  </span>
                </td>
                {canEdit ? (
                  <td className="px-3 py-2">
                    <form
                      action={(formData) => void save(row, formData)}
                      id={`capacity-${row.id}`}
                    >
                      <button
                        className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                        disabled={busyId !== null}
                        type="submit"
                      >
                        {busyId === row.id ? "..." : "Save"}
                      </button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
