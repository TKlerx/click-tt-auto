"use client";

import {
  Activity,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gauge,
  HeartPulse,
  KeyRound,
  ListChecks,
  RadioTower,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Role } from "../../../generated/prisma/enums";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const iconClassName = "size-4";

export function Navigation({ user }: { user: SessionUser }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  const links = [
    { href: "/dashboard", label: t("dashboard"), icon: Gauge },
    { href: "/settings/tokens", label: t("tokens"), icon: KeyRound },
    { href: "/docs/api", label: t("apiDocs"), icon: BookOpen },
  ];

  if (user.role === Role.PLATFORM_ADMIN) {
    links.push({
      href: "/background-jobs",
      label: t("backgroundJobs"),
      icon: Activity,
    });
    links.push({
      href: "/admin/ops",
      label: t("opsHealth"),
      icon: HeartPulse,
    });
    links.push({ href: "/users", label: t("users"), icon: UsersRound });
    links.push({
      href: "/audit-trail",
      label: t("auditTrail"),
      icon: ListChecks,
    });
    links.push({
      href: "/admin/notifications",
      label: t("notifications"),
      icon: Bell,
    });
    links.push({
      href: "/admin/integrations/teams",
      label: t("teamsIntegrations"),
      icon: RadioTower,
    });
    links.push({
      href: "/admin/tokens",
      label: t("adminTokens"),
      icon: ShieldCheck,
    });
  }

  function scrollNav(direction: "left" | "right") {
    navRef.current?.scrollBy({
      left: direction === "left" ? -280 : 280,
      behavior: "smooth",
    });
  }

  return (
    <div className="flex max-w-full items-stretch gap-2">
      <button
        aria-label="Scroll navigation left"
        className="inline-flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:translate-y-px"
        type="button"
        onClick={() => scrollNav("left")}
      >
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>
      <nav
        ref={navRef}
        className="flex min-h-12 min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] px-1 pb-2 pt-1 text-sm [scrollbar-gutter:stable]"
      >
        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-medium text-[color:var(--muted-foreground)] transition duration-200 ease-out hover:bg-[var(--secondary)] hover:text-[color:var(--foreground)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]",
                isActive && "hover:bg-[var(--foreground)]",
              )}
              href={link.href}
              style={
                isActive
                  ? {
                      backgroundColor: "var(--foreground)",
                      color: "var(--background)",
                    }
                  : undefined
              }
            >
              <Icon
                aria-hidden="true"
                className={iconClassName}
                strokeWidth={2}
              />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        aria-label="Scroll navigation right"
        className="inline-flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:translate-y-px"
        type="button"
        onClick={() => scrollNav("right")}
      >
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
