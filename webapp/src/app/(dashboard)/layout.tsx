import { Navigation } from "@/components/ui/Navigation";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { requireSession } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { getLocale, getTranslations } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const t = await getTranslations("common");
  const locale = await getLocale();

  return (
    <main className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <header className="sticky top-3 z-20 rounded-3xl border border-[var(--border)] bg-[var(--panel)] px-4 py-5 sm:px-5 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              {t("appName")}
            </p>
            <p className="mt-2 truncate text-lg font-semibold tracking-tight sm:text-xl">
              {user.name}
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {user.email}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 xl:items-end">
            <Navigation user={user} />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <LocaleSwitcher currentLocale={locale} />
              <ThemeToggle user={user} />
              <form action={withBasePath("/api/auth/logout")} method="post">
                <Button
                  className="font-semibold"
                  type="submit"
                  variant="secondary"
                >
                  {t("signOut")}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <div className="mt-8 sm:mt-10">{children}</div>
    </main>
  );
}
