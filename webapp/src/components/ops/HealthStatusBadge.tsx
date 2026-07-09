import type { HealthStatus } from "@/lib/ops-health";

const toneByStatus: Record<HealthStatus, string> = {
  healthy:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  degraded:
    "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  unknown:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unavailable:
    "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function HealthStatusBadge({
  status,
  label,
}: {
  status: HealthStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${toneByStatus[status]}`}
    >
      {label}
    </span>
  );
}
