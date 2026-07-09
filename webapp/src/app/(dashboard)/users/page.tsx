import { Role } from "../../../../generated/prisma/enums";
import { CreateUserDialog } from "@/components/auth/CreateUserDialog";
import { UserManagementTable } from "@/components/auth/UserManagementTable";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";

export default async function UsersPage() {
  const user = await requireSession();
  const t = await getTranslations("users");

  if (user.role !== Role.PLATFORM_ADMIN) {
    return <div className="text-lg font-medium">{t("notAuthorized")}</div>;
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  const activeUsers = users.filter((entry) => entry.status === "ACTIVE").length;
  const pendingUsers = users.filter(
    (entry) => entry.status === "PENDING_APPROVAL",
  ).length;
  const adminUsers = users.filter(
    (entry) => entry.role === "PLATFORM_ADMIN",
  ).length;

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.45fr)] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            {t("title")}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-pretty sm:text-5xl">
            {t("title")}
          </h1>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_92%,transparent)]">
          <UserMetric label={t("statuses.ACTIVE")} value={activeUsers} />
          <UserMetric
            label={t("statuses.PENDING_APPROVAL")}
            value={pendingUsers}
          />
          <UserMetric label={t("roles.PLATFORM_ADMIN")} value={adminUsers} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <CreateUserDialog />
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("title")}
            </h2>
          </div>
          <UserManagementTable currentUserId={user.id} users={users} />
        </section>
      </div>
    </div>
  );
}

function UserMetric({ label, value }: { label: string; value: number }) {
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
