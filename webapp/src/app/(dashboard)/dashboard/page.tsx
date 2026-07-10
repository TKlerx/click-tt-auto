import { redirect } from "next/navigation";
import { Mail, Palette, ShieldCheck, Signal } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const user = await requireSession();
  const t = await getTranslations("dashboard");

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const profileItems = [
    { label: t("role"), value: user.role, icon: ShieldCheck },
    { label: t("status"), value: user.status, icon: Signal },
    { label: t("theme"), value: user.themePreference, icon: Palette },
    { label: t("email"), value: user.email, icon: Mail },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            {t("label")}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-pretty sm:text-5xl">
            {t("welcomeBack", { name: user.name })}
          </h1>
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_24px_60px_-48px_var(--foreground)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            {t("status")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]">
              <Signal aria-hidden="true" className="size-5" strokeWidth={2} />
            </span>
            <p className="font-mono text-2xl font-semibold tracking-tight">
              {user.status}
            </p>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_1fr]">
        {profileItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <article
              key={item.label}
              className={[
                "group rounded-3xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_94%,transparent)] p-5 shadow-[0_20px_48px_-44px_var(--foreground)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--border)_60%,var(--accent)_40%)] sm:p-6",
                index === 3 ? "md:col-span-2 xl:col-span-1" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-[var(--muted-foreground)]">
                  {item.label}
                </p>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--secondary)] text-[var(--secondary-foreground)] transition duration-200 group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent-soft-foreground)]">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                </span>
              </div>
              <p className="mt-5 break-words font-mono text-xl font-semibold tracking-tight sm:text-2xl">
                {item.value}
              </p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
