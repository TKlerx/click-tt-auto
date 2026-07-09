import { CreateTokenDialog } from "@/components/tokens/create-token-dialog";
import { CliDownloads } from "@/components/tokens/cli-downloads";
import { TokenList } from "@/components/tokens/token-list";
import { requireSession } from "@/lib/auth";
import { listTokens } from "@/services/api/tokens";
import { getTranslations } from "next-intl/server";

export default async function TokensPage() {
  const user = await requireSession();
  const t = await getTranslations("tokens");
  const tokens = await listTokens(user.id, false);
  const activeTokens = tokens.filter(
    (token) => token.status === "ACTIVE" && !token.isExpired,
  ).length;
  const expiredTokens = tokens.filter((token) => token.isExpired).length;

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)] sm:text-base">
            {t("description")}
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <TokenMetric label={t("status.ACTIVE")} value={activeTokens} />
          <TokenMetric label={t("statusExpired")} value={expiredTokens} />
        </div>
      </section>

      <CliDownloads />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <CreateTokenDialog />
        <TokenList initialTokens={tokens} />
      </div>
    </div>
  );
}

function TokenMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="truncate text-xs font-medium text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}
