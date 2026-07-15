"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { putGymCapacity } from "@/components/raster/capacity/capacity-client";
import { BusyLabel } from "@/components/ui/busy-label";

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
  district,
  rows,
}: {
  canEdit?: boolean;
  district: string;
  rows: CapacityRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveCapacity(row: CapacityRow, capacity: number) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const error = await putGymCapacity({
        capacity,
        district: row.district,
        id: row.id,
      });
      if (error) {
        setMessage(error);
        return false;
      }
      setMessage("Capacity saved");
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function save(row: CapacityRow, formData: FormData) {
    if (await saveCapacity(row, Number(formData.get("capacity")))) {
      window.location.reload();
    }
  }

  async function saveAllVisible() {
    setBusyId("all");
    setMessage(null);
    try {
      for (const row of rows) {
        const capacity = Number(
          document.querySelector<HTMLInputElement>(
            `[data-capacity-id="${row.id}"]`,
          )?.value ?? row.capacity,
        );
        const saved = await saveCapacity(row, capacity);
        if (!saved) return;
      }
      setMessage("Gym capacities saved");
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function add(formData: FormData) {
    setBusyId("new");
    setMessage(null);
    try {
      const response = await fetch(withBasePath("/api/raster/capacity"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          district,
          clubId: String(formData.get("clubId") ?? ""),
          hall: String(formData.get("gym") ?? ""),
          weekday: String(formData.get("weekday") ?? ""),
          capacity: Number(formData.get("capacity")),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Save failed (${response.status})`);
        return;
      }
      setMessage("Gym capacity saved");
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-2">
      {message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
      {canEdit ? (
        <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3">
          <div className="flex flex-wrap gap-2">
            {rows.length ? (
              <button
                className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                disabled={busyId !== null}
                onClick={() => void saveAllVisible()}
                type="button"
              >
                {busyId === "all" ? (
                  <BusyLabel label="Saving" />
                ) : (
                  "Save all visible"
                )}
              </button>
            ) : null}
          </div>
          <form
            action={(formData) => void add(formData)}
            className="grid gap-2 md:grid-cols-[minmax(10rem,1fr)_6rem_8rem_6rem_auto]"
          >
            <input
              className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              name="clubId"
              placeholder="Club id"
              required
            />
            <input
              className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              name="gym"
              placeholder="Gym"
              required
            />
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              defaultValue="FRIDAY"
              name="weekday"
            >
              {[
                "MONDAY",
                "TUESDAY",
                "WEDNESDAY",
                "THURSDAY",
                "FRIDAY",
                "SATURDAY",
                "SUNDAY",
              ].map((weekday) => (
                <option key={weekday} value={weekday}>
                  {weekday}
                </option>
              ))}
            </select>
            <input
              className="h-9 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              min={0}
              name="capacity"
              placeholder="Capacity"
              required
              type="number"
            />
            <button
              className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              disabled={busyId !== null}
              type="submit"
            >
              {busyId === "new" ? (
                <BusyLabel label="Saving" />
              ) : (
                "Add gym capacity"
              )}
            </button>
          </form>
        </div>
      ) : null}
      {!rows.length ? (
        <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
          No gym capacity rows.
        </p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Club</th>
                <th className="px-3 py-2">Gym</th>
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
                        data-capacity-id={row.id}
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
                          {busyId === row.id ? (
                            <BusyLabel label="Saving" />
                          ) : (
                            "Save"
                          )}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
