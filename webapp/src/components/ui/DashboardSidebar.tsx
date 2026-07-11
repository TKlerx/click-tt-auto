"use client";

import { CalendarRange, Gauge } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const iconClassName = "size-4 shrink-0";

export function DashboardSidebar() {
  const common = useTranslations("common");
  const t = useTranslations("nav");
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: t("dashboard"), icon: Gauge },
    { href: "/raster", label: t("raster"), icon: CalendarRange },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-sm md:flex md:flex-col">
      <div className="flex h-16 items-center border-b border-[var(--border)] px-5">
        <Link
          className="truncate text-sm font-semibold tracking-normal text-[var(--foreground)]"
          href="/dashboard"
        >
          {common("appName")}
        </Link>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 text-sm">
        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-3 rounded-md px-3 py-2 font-medium text-[var(--muted-foreground)] transition duration-200 hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]",
                isActive &&
                  "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
              )}
              href={href}
            >
              <Icon aria-hidden="true" className={iconClassName} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
