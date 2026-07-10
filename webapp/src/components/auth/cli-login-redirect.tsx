"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export function CliLoginRedirect({
  redirectUrl,
  success,
}: {
  redirectUrl?: string;
  success: boolean;
}) {
  const t = useTranslations("cliLogin");

  useEffect(() => {
    if (!success || !redirectUrl) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.assign(redirectUrl);
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [redirectUrl, success]);

  return (
    <div className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-[var(--panel)] p-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-white/10">
      <p className="text-xs uppercase tracking-[0.28em] opacity-45">CLI</p>
      <h1 className="mt-4 text-3xl font-semibold">
        {success ? t("successTitle") : t("errorTitle")}
      </h1>
      <p className="mt-3 text-sm opacity-75">
        {success ? t("redirecting") : t("errorMessage")}
      </p>
    </div>
  );
}
