import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TokenList } from "@/components/tokens/token-list";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAllTokens } from "@/services/api/tokens";
import { Role } from "../../../../../generated/prisma/enums";

export default async function AdminTokensPage() {
  const user = await requireSession();
  const t = await getTranslations("adminTokens");
  const tokensT = await getTranslations("tokens");
  if (user.role !== Role.PLATFORM_ADMIN) {
    redirect("/dashboard");
  }

  const [tokens, users] = await Promise.all([
    listAllTokens({ showAll: false }),
    prisma.user.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  const activeTokens = tokens.filter(
    (token) => token.status === "ACTIVE" && !token.isExpired,
  ).length;
  const expiredTokens = tokens.filter((token) => token.isExpired).length;

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            {tokensT("eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)] sm:text-base">
            {t("tableDescription")}
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <AdminTokenMetric
            label={tokensT("status.ACTIVE")}
            value={activeTokens}
          />
          <AdminTokenMetric
            label={tokensT("statusExpired")}
            value={expiredTokens}
          />
          <AdminTokenMetric label={t("user")} value={users.length} />
        </div>
      </section>
      <TokenList adminMode initialTokens={tokens} users={users} />
    </div>
  );
}

function AdminTokenMetric({ label, value }: { label: string; value: number }) {
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
