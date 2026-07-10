"use client";

import { Clipboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type ToastState = "success" | "error" | null;

export function DiagnosticSummaryCopy({ text }: { text: string }) {
  const t = useTranslations("opsHealth.copy");
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function copySummary() {
    try {
      await writeClipboardText(text);
      setToast("success");
    } catch {
      setToast("error");
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-3">
      <Button
        className="inline-flex items-center gap-2"
        type="button"
        variant="secondary"
        onClick={copySummary}
      >
        <Clipboard aria-hidden="true" className="size-4" />
        {t("button")}
      </Button>
      <div aria-live="polite" className="min-h-7 text-sm">
        {toast ? (
          <span
            className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[var(--foreground)] shadow-[0_18px_42px_-34px_var(--foreground)]"
            role="status"
          >
            {toast === "success" ? t("success") : t("error")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path for browsers/test contexts
      // without clipboard permissions.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textArea.remove();
  }
}
