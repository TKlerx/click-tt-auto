import { DashboardSidebar } from "@/components/ui/DashboardSidebar";
import { UserMenu } from "@/components/ui/UserMenu";
import { requireSession } from "@/lib/auth";
import { getLocale } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const locale = await getLocale();

  return (
    <div className="relative min-h-[100dvh] md:pl-64">
      <DashboardSidebar />
      <div className="fixed right-4 top-3 z-50">
        <UserMenu user={user} locale={locale} />
      </div>
      <main className="min-h-[100dvh]">{children}</main>
    </div>
  );
}
