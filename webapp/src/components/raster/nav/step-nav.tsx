"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import type { RasterStepReadiness } from "@/lib/raster/readiness";
import { rasterSteps, type RasterStep } from "@/lib/raster/readiness";

const labels: Record<RasterStep, string> = {
  import: "Import data",
  review: "Review data",
  run: "Run optimizer",
  runs: "Review optimization runs",
};

export function StepNav({
  readiness,
}: {
  readiness?: Partial<Record<RasterStep, RasterStepReadiness>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loadedReadiness, setLoadedReadiness] =
    useState<Partial<Record<RasterStep, RasterStepReadiness>>>();
  const query = searchParams.toString();
  const currentReadiness = readiness ?? loadedReadiness;

  useEffect(() => {
    if (readiness || !searchParams.get("scope")) return;
    let cancelled = false;
    fetch(withBasePath(`/api/raster/readiness?${query}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { readiness?: typeof currentReadiness } | null) => {
        if (!cancelled && body?.readiness) {
          setLoadedReadiness(body.readiness);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query, readiness, searchParams]);

  return (
    <nav aria-label="Raster workflow" className="grid gap-1">
      {rasterSteps.map((step) => {
        const href = `/raster/${step}?${searchParams.toString()}`;
        const active = pathname.endsWith(`/raster/${step}`);
        const stepReadiness = currentReadiness?.[step];
        const state = stepReadiness?.state;
        return (
          <Link
            className={`rounded-md border px-3 py-2 text-sm ${
              active
                ? "border-[var(--primary)] bg-[var(--panel)]"
                : "border-transparent text-[var(--muted-foreground)]"
            }`}
            href={href}
            key={step}
          >
            <span className="block font-medium">{labels[step]}</span>
            {state ? (
              <span className="block text-xs text-[var(--muted-foreground)]">
                {stateLabel(stepReadiness)}
              </span>
            ) : null}
            {stepReadiness?.outstanding.length ? (
              <span className="block text-xs text-[var(--muted-foreground)]">
                {stepReadiness.outstanding.slice(0, 2).join("; ")}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function stateLabel(readiness: RasterStepReadiness | undefined) {
  if (!readiness) return "";
  const label =
    readiness.state === "not-started"
      ? "Not started"
      : readiness.state === "outstanding"
        ? "Outstanding"
        : readiness.state === "blocked"
          ? "Blocked"
          : "Ready";
  const suffix = [
    readiness.resolvedBy ? `resolve in ${labels[readiness.resolvedBy]}` : "",
    readiness.hasExclusions ? "exclusions" : "",
  ]
    .filter(Boolean)
    .join(", ");
  return suffix ? `${label}: ${suffix}` : label;
}
