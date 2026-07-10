import { requireSession } from "@/lib/auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { listInputSets } from "@/services/raster";

export default async function RasterPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const user = await requireSession();
  const district = (await searchParams).district?.trim() || "OWL";
  const access = await assertRasterAccess(user, district, "viewer");

  if (access !== true) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        You are not authorized to access Raster data for {district}.
      </div>
    );
  }

  const inputSets = await listInputSets(district);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {district}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Raster
        </h1>
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <span>Name</span>
          <span>Status</span>
          <span>Wishes</span>
          <span>Runs</span>
        </div>
        {inputSets.length ? (
          inputSets.map((inputSet) => (
            <div
              key={inputSet.id}
              className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
            >
              <span className="font-medium">{inputSet.name}</span>
              <span>{inputSet.status}</span>
              <span>{inputSet._count.wishes}</span>
              <span>{inputSet._count.runs}</span>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No input sets.
          </p>
        )}
      </section>
    </div>
  );
}
