"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { withBasePath } from "@/lib/base-path";
import { useToast } from "@/components/ui/Toast";

type AuditExportButtonProps = {
  queryString: string;
};

export function AuditExportButton({ queryString }: AuditExportButtonProps) {
  const t = useTranslations("audit");
  const { pushToast } = useToast();
  const [busyFormat, setBusyFormat] = useState<"csv" | "pdf" | null>(null);
  const suffix = queryString ? `&${queryString}` : "";

  async function handleExport(format: "csv" | "pdf") {
    setBusyFormat(format);
    try {
      const response = await fetch(
        withBasePath(`/api/audit/export?format=${format}${suffix}`),
      );
      if (!response.ok) {
        pushToast(t("empty"));
        return;
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = format === "csv" ? "audit-trail.csv" : "audit-trail.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);

      if (response.headers.get("X-Audit-Export-Truncated") === "1") {
        const count = response.headers.get("X-Audit-Export-Count") ?? "0";
        pushToast(t("exportTruncated", { count }));
      }
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        onClick={() => void handleExport("csv")}
        disabled={busyFormat !== null}
      >
        {t("exportCsv")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void handleExport("pdf")}
        disabled={busyFormat !== null}
      >
        {t("exportPdf")}
      </Button>
    </div>
  );
}
