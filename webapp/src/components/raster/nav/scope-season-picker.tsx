"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RasterScopeOption } from "@/lib/raster/access";
import { getRasterScopeLevel } from "@/lib/raster/scope-level";
import { rasterSeasonOptions } from "@/lib/raster/season";

const levelLabel = {
  association: "Verband",
  bezirk: "Bezirk",
  root: "",
  unknown: "",
};

export function ScopeSeasonPicker({ scopes }: { scopes: RasterScopeOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentScope = searchParams.get("scope") ?? scopes[0]?.code ?? "";
  const currentSeason = searchParams.get("season") ?? "2026/27";

  function update(name: "scope" | "season", value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(name, value);
    next.delete("workspace");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Scope
        <select
          className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
          onChange={(event) => update("scope", event.target.value)}
          value={currentScope}
        >
          {scopes.map((scope) => {
            const level = levelLabel[getRasterScopeLevel(scope)];
            return (
              <option key={scope.code} value={scope.code}>
                {level ? `${level}: ` : ""}
                {scopePath(scope)}
              </option>
            );
          })}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Season
        <select
          className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
          onChange={(event) => update("season", event.target.value)}
          value={currentSeason}
        >
          {rasterSeasonOptions().map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function scopePath(scope: RasterScopeOption) {
  return [scope.parent?.parent, scope.parent, scope]
    .filter((item): item is { code: string; name: string } => Boolean(item))
    .map((item) => item.name)
    .join(" / ");
}
