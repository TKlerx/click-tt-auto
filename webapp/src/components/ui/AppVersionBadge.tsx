import { getAppVersionLabel } from "@/lib/app-version";

export function AppVersionBadge() {
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 max-w-[calc(100vw-1.5rem)] truncate rounded border border-black/10 bg-[color:color-mix(in_srgb,var(--panel)_88%,transparent)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--foreground)] opacity-75 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-white/10">
      {getAppVersionLabel()}
    </div>
  );
}
