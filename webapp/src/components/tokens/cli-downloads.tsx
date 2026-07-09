"use client";

import { Download, ExternalLink, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { withBasePath } from "@/lib/base-path";

type CliReleaseAsset = {
  target: string;
  label: string;
  filename: string;
  available: boolean;
};

type CliReleaseResponse = {
  assets: CliReleaseAsset[];
  checksumsAvailable: boolean;
};

export function CliDownloads() {
  const [serverUrl] = useState(() =>
    typeof window === "undefined"
      ? "<APP_URL>"
      : (window.location.href.split("/settings/tokens")[0] ??
        window.location.origin),
  );
  const [downloads, setDownloads] = useState<CliReleaseResponse | null>(null);

  useEffect(() => {
    void fetch(withBasePath("/api/downloads/cli"))
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: CliReleaseResponse | null) => setDownloads(payload))
      .catch(() => setDownloads(null));
  }, []);

  const assets = downloads?.assets.filter((asset) => asset.available) ?? [];

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Terminal className="mt-1 size-5 shrink-0 text-[var(--muted-foreground)]" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">CLI downloads</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Download starterctl, create a token, then configure it for this app.
          </p>
        </div>
      </div>

      <pre className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/5 p-3 font-mono text-xs dark:bg-white/5">
{`starterctl configure --server ${serverUrl} --token <TOKEN>
starterctl health`}
      </pre>

      {assets.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Button
              className="justify-start gap-2"
              key={asset.target}
              onClick={() => {
                window.location.href = withBasePath(
                  `/api/downloads/cli/${asset.target}`,
                );
              }}
              type="button"
              variant="secondary"
            >
              <Download className="size-4" />
              {asset.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          No hosted CLI artifacts are available on this deployment yet.
        </p>
      )}

      {downloads?.checksumsAvailable ? (
        <Button
          className="mt-3 gap-2"
          onClick={() => {
            window.location.href = withBasePath("/api/downloads/cli/checksums");
          }}
          type="button"
          variant="secondary"
        >
          <ExternalLink className="size-4" />
          Checksums
        </Button>
      ) : null}
    </section>
  );
}
