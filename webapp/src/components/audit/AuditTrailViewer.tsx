"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";
import { AuditExportButton } from "@/components/audit/AuditExportButton";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
  actor: { name: string; email: string };
  scope?: { name: string } | null;
};

export function AuditTrailViewer() {
  const t = useTranslations("audit");
  const commonT = useTranslations("common");
  const [filters, setFilters] = useState({
    action: "",
    entityType: "",
  });
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuditRows() {
      setLoading(true);
      setError(null);

      try {
        const suffix = queryString ? `?${queryString}` : "";
        const response = await fetch(withBasePath(`/api/audit${suffix}`), {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as {
          data?: AuditRow[];
          error?: string;
        } | null;

        if (!response.ok) {
          setError(payload?.error ?? commonT("error"));
          setRows([]);
          return;
        }

        setRows(payload?.data ?? []);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setError(commonT("error"));
          setRows([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAuditRows();

    return () => controller.abort();
  }, [commonT, queryString]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span className="text-[var(--muted-foreground)]">
              {t("action")}
            </span>
            <input
              className="min-h-11 rounded-lg border border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              placeholder={t("action")}
              value={filters.action}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span className="text-[var(--muted-foreground)]">
              {t("entity")}
            </span>
            <input
              className="min-h-11 rounded-lg border border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  entityType: event.target.value,
                }))
              }
              placeholder={t("entity")}
              value={filters.entityType}
            />
          </label>
        </div>
        <AuditExportButton queryString={queryString} />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <table className="min-w-full bg-[var(--panel)] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              <th className="px-4 py-3 sm:px-6">{t("date")}</th>
              <th className="px-4 py-3">{t("actor")}</th>
              <th className="px-4 py-3">{t("action")}</th>
              <th className="px-4 py-3">{t("entity")}</th>
              <th className="px-4 py-3">{t("scope")}</th>
              <th className="px-4 py-3 sm:px-6">{t("details")}</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr
                    className="border-b border-[var(--border)] last:border-b-0"
                    key={index}
                  >
                    {Array.from({ length: 6 }, (_cell, cellIndex) => (
                      <td
                        className={[
                          "px-4 py-4",
                          cellIndex === 0 ? "sm:px-6" : "",
                          cellIndex === 5 ? "sm:px-6" : "",
                        ].join(" ")}
                        key={cellIndex}
                      >
                        <div className="h-3 w-full max-w-32 animate-pulse rounded bg-[var(--secondary)]" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!loading && error ? (
              <tr>
                <td
                  className="px-4 py-8 text-sm text-[var(--destructive)] sm:px-6"
                  colSpan={6}
                >
                  {error}
                </td>
              </tr>
            ) : null}
            {!loading && !error && rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-sm text-[var(--muted-foreground)] sm:px-6"
                  colSpan={6}
                >
                  {t("empty")}
                </td>
              </tr>
            ) : null}
            {!loading && !error
              ? rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] align-top transition-colors last:border-b-0 hover:bg-[color:color-mix(in_srgb,var(--panel)_86%,var(--background)_14%)]"
                  >
                    <td className="px-4 py-4 font-mono text-xs text-[var(--muted-foreground)] sm:px-6">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{row.actor.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {row.actor.email}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-3 py-1 text-xs font-semibold text-[var(--secondary-foreground)]">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{row.entityType}</div>
                      <div className="font-mono text-xs text-[var(--muted-foreground)]">
                        {row.entityId}
                      </div>
                    </td>
                    <td className="px-4 py-4">{row.scope?.name ?? "-"}</td>
                    <td className="max-w-[24rem] px-4 py-4 text-[var(--muted-foreground)] sm:px-6">
                      {row.details}
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
