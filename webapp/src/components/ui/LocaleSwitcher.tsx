"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { locales, type Locale } from "@/i18n/config";
import { withBasePath } from "@/lib/base-path";

const localeLabels: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

export function LocaleSwitcher({ currentLocale }: { currentLocale: string }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(newLocale: string) {
    startTransition(async () => {
      const response = await fetch(withBasePath("/api/locale"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });

      if (response.ok) {
        window.location.reload();
      }
    });
  }

  return (
    <Select
      disabled={isPending}
      value={currentLocale}
      onValueChange={handleChange}
    >
      <SelectTrigger
        aria-label="Locale"
        className="min-h-10 min-w-32 rounded-xl border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 font-medium shadow-sm transition duration-200 active:translate-y-px"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-[var(--border)]">
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeLabels[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
