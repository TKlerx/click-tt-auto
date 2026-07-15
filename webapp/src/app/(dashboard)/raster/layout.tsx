import { requireSession } from "@/lib/auth";
import { listAccessibleRasterScopes } from "@/lib/raster/access";
import { ScopeSeasonPicker } from "@/components/raster/nav/scope-season-picker";
import { StepNav } from "@/components/raster/nav/step-nav";

export default async function RasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const scopes = await listAccessibleRasterScopes(user);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <ScopeSeasonPicker scopes={scopes} />
        <StepNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
