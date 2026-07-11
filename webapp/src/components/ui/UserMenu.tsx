"use client";

import {
  Activity,
  Bell,
  BookOpen,
  Check,
  Globe,
  HeartPulse,
  KeyRound,
  ListChecks,
  LogOut,
  RadioTower,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { Role } from "../../../generated/prisma/enums";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { locales, type Locale } from "@/i18n/config";
import type { SessionUser } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";

const localeLabels: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export function UserMenu({
  user,
  locale,
}: {
  user: SessionUser;
  locale: string;
}) {
  const t = useTranslations("nav");
  const common = useTranslations("common");
  const [, startLocaleTransition] = useTransition();

  function switchLocale(nextLocale: string) {
    startLocaleTransition(async () => {
      const response = await fetch(withBasePath("/api/locale"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });

      if (response.ok) {
        window.location.reload();
      }
    });
  }

  const links = [
    { href: "/settings/tokens", label: t("tokens"), icon: KeyRound },
    { href: "/docs/api", label: t("apiDocs"), icon: BookOpen },
  ];

  const adminLinks =
    user.role === Role.PLATFORM_ADMIN
      ? [
          { href: "/users", label: t("users"), icon: UsersRound },
          { href: "/audit-trail", label: t("auditTrail"), icon: ListChecks },
          {
            href: "/background-jobs",
            label: t("backgroundJobs"),
            icon: Activity,
          },
          { href: "/admin/ops", label: t("opsHealth"), icon: HeartPulse },
          {
            href: "/admin/notifications",
            label: t("notifications"),
            icon: Bell,
          },
          {
            href: "/admin/integrations/teams",
            label: t("teamsIntegrations"),
            icon: RadioTower,
          },
          { href: "/admin/tokens", label: t("adminTokens"), icon: ShieldCheck },
        ]
      : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Open user menu"
          className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-foreground)] shadow-sm transition duration-200 hover:opacity-90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]"
          type="button"
        >
          {getInitials(user.name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-lg"
      >
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs font-normal text-[var(--muted-foreground)]">
            {user.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link className="cursor-pointer gap-2" href={href}>
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
        {adminLinks.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link className="cursor-pointer gap-2" href={href}>
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <ThemeToggle user={user} />
        </div>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Globe aria-hidden="true" className="size-4" />
            {localeLabels[locale as Locale] ?? "Language"}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-lg">
            {locales.map((nextLocale) => (
              <DropdownMenuItem
                key={nextLocale}
                className="cursor-pointer gap-2"
                onSelect={(event) => {
                  event.preventDefault();
                  switchLocale(nextLocale);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={`size-4 ${
                    nextLocale === locale ? "opacity-100" : "opacity-0"
                  }`}
                />
                {localeLabels[nextLocale]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <form
          action={withBasePath("/api/auth/logout")}
          className="px-1 pb-1"
          method="post"
        >
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-[var(--destructive)] transition duration-200 hover:bg-[var(--secondary)] active:translate-y-px"
            type="submit"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {common("signOut")}
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
