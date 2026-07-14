"use client";

import { withBasePath } from "@/lib/base-path";

export async function putGymCapacity({
  capacity,
  district,
  id,
}: {
  capacity: number;
  district: string;
  id: string;
}) {
  const response = await fetch(withBasePath(`/api/raster/capacity/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      district,
      capacity,
      basis: "REVIEWED",
    }),
  });
  if (response.ok) return null;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Save failed (${response.status})`;
}
