import { requireSession } from "@/lib/auth";
import {
  assertRasterAccess,
  listAccessibleRasterScopes,
  type RasterScopeOption,
} from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";

export type RasterStepSearchParams = Promise<{
  scope?: string;
  season?: string;
}>;

type RasterStepContext =
  | {
      user: Awaited<ReturnType<typeof requireSession>>;
      scopes: RasterScopeOption[];
      scope: RasterScopeOption;
      season: string;
    }
  | { error: string };

export async function requireRasterStep(
  searchParams: RasterStepSearchParams,
): Promise<RasterStepContext> {
  const user = await requireSession();
  const scopes = await listAccessibleRasterScopes(user);
  const params = await searchParams;
  const scopeCode = params.scope?.trim() || scopes[0]?.code;
  const season = normalizeRasterSeason(params.season);

  if (!scopeCode) {
    return { error: "No Raster scopes are configured for your account." };
  }

  const access = await assertRasterAccess(user, scopeCode, "viewer");
  if (access !== true) {
    return {
      error: `You are not authorized to access Raster data for ${scopeCode}.`,
    };
  }

  const scope = scopes.find((candidate) => candidate.code === scopeCode);
  if (!scope) {
    return { error: `Raster scope ${scopeCode} was not found.` };
  }

  return { user, scopes, scope, season };
}

export function RasterStepError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
      {message}
    </div>
  );
}
