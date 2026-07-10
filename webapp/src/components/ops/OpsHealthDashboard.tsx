"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { DiagnosticSummaryCopy } from "@/components/ops/DiagnosticSummaryCopy";
import { HealthStatusBadge } from "@/components/ops/HealthStatusBadge";
import type { HealthCheckKey, HealthSnapshot } from "@/lib/ops-health";
import { withBasePath } from "@/lib/base-path";

const checkOrder: HealthCheckKey[] = [
  "runtime",
  "database",
  "configuration",
  "worker",
  "deploySmoke",
];

export function OpsHealthDashboard({
  initialSnapshot,
}: {
  initialSnapshot: HealthSnapshot;
}) {
  const t = useTranslations("opsHealth");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshSnapshot() {
    startTransition(async () => {
      setError(null);
      const response = await fetch(withBasePath("/api/admin/ops-health"), {
        cache: "no-store",
      });
      if (!response.ok) {
        setError(t("refreshFailed"));
        return;
      }

      setSnapshot((await response.json()) as HealthSnapshot);
    });
  }

  const checks = [...snapshot.checks].sort(
    (a, b) => checkOrder.indexOf(a.key) - checkOrder.indexOf(b.key),
  );

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm opacity-70 sm:text-base">
            {t("description")}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            {t("overall")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <HealthStatusBadge
              label={t(`status.${snapshot.overallStatus}`)}
              status={snapshot.overallStatus}
            />
            <span className="font-mono text-xs text-[var(--muted-foreground)]">
              {t("capturedAt", { value: snapshot.capturedAt })}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("environment.title")}
            </h2>
            <Button
              className="inline-flex items-center gap-2"
              disabled={isPending}
              type="button"
              variant="secondary"
              onClick={refreshSnapshot}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${isPending ? "animate-spin" : ""}`}
              />
              {isPending ? t("refreshing") : t("refresh")}
            </Button>
          </div>
          {error ? (
            <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <MetaRow
              label={t("environment.environment")}
              value={snapshot.environment.environment}
            />
            <MetaRow
              label={t("environment.version")}
              value={snapshot.environment.version}
            />
            <MetaRow
              label={t("environment.revision")}
              value={snapshot.environment.revision}
            />
            <MetaRow
              label={t("environment.buildId")}
              value={snapshot.environment.buildId}
            />
            <MetaRow
              label={t("environment.builtAt")}
              value={snapshot.environment.builtAt}
            />
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("summary.title")}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {t("summary.description")}
          </p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_84%,var(--background)_16%)] p-4 font-mono text-xs text-[var(--muted-foreground)]">
            {snapshot.diagnosticSummary.text}
          </pre>
          <div className="mt-4">
            <DiagnosticSummaryCopy text={snapshot.diagnosticSummary.text} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {checks.map((check) => (
          <article
            key={check.key}
            className="min-h-44 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">
                {t(`checks.${check.key}`)}
              </h2>
              <HealthStatusBadge
                label={t(`status.${check.status}`)}
                status={check.status}
              />
            </div>
            <p className="mt-4 text-sm text-[var(--foreground)]">
              {check.summary}
            </p>
            {check.detail ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                {check.detail}
              </p>
            ) : null}
            {check.checkedAt ? (
              <p className="mt-4 font-mono text-xs text-[var(--muted-foreground)]">
                {t("checkedAt", { value: check.checkedAt })}
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_84%,var(--background)_16%)] p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-2 break-all font-mono text-sm">{value}</dd>
    </div>
  );
}
