import { Role } from "../../../../generated/prisma/enums";
import { CreateUserDialog } from "@/components/auth/CreateUserDialog";
import { UserLookupPanel } from "@/components/auth/UserLookupPanel";
import { UserManagementTable } from "@/components/auth/UserManagementTable";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSelectableRasterScope } from "@/lib/raster/scope-level";
import { getTranslations } from "next-intl/server";

export default async function UsersPage() {
  const user = await requireSession();
  const t = await getTranslations("users");

  if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.SCOPE_ADMIN) {
    return <div className="text-lg font-medium">{t("notAuthorized")}</div>;
  }

  const isPlatformAdmin = user.role === Role.PLATFORM_ADMIN;
  const users = isPlatformAdmin
    ? await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          scopeAssignments: { include: { scope: { select: scopeSelect } } },
        },
      })
    : [];
  const scopes = await prisma.scope.findMany({
    where: isPlatformAdmin
      ? undefined
      : { userAssignments: { some: { userId: user.id } } },
    select: scopeSelect,
    orderBy: { name: "asc" },
  });
  const assignableScopes = scopes.filter(isSelectableRasterScope);
  const accessReviewScopes = await prisma.scope.findMany({
    where: {
      id: { in: assignableScopes.map((scope) => scope.id) },
    },
    select: {
      ...scopeSelect,
      userAssignments: {
        select: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { user: { email: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });
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
        {isPlatformAdmin ? <CreateUserDialog /> : null}
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("title")}
            </h2>
          </div>
          {isPlatformAdmin ? (
            <UserManagementTable
              availableScopes={assignableScopes}
              currentUserId={user.id}
              users={users.map((entry) => ({
                ...entry,
                scopes: entry.scopeAssignments.map(
                  (assignment) => assignment.scope,
                ),
              }))}
            />
          ) : (
            <div className="p-4 sm:p-6">
              <UserLookupPanel
                availableScopes={assignableScopes}
                currentUserId={user.id}
              />
            </div>
          )}
        </section>
      </div>
      <ScopeAccessReview scopes={accessReviewScopes} />
    </div>
  );
}

const scopeSelect = {
  id: true,
  code: true,
  name: true,
  parent: {
    select: {
      code: true,
      name: true,
      parent: { select: { code: true, name: true } },
    },
  },
} as const;

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

function ScopeAccessReview({ scopes }: { scopes: ScopeAccessReviewScope[] }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">Scope access</h2>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {scopes.map((scope) => (
          <div className="grid gap-3 px-4 py-4 sm:px-6" key={scope.id}>
            <div>
              <h3 className="font-medium">{scope.name}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {scope.code}
              </p>
            </div>
            {scope.userAssignments.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No users assigned.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {scope.userAssignments.map(({ user }) => (
                  <span
                    className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-3 py-1 text-xs font-semibold text-[var(--secondary-foreground)]"
                    key={user.id}
                  >
                    {user.name || user.email}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

type ScopeAccessReviewScope = {
  id: string;
  code: string;
  name: string;
  userAssignments: Array<{
    user: { id: string; name: string; email: string; role: Role };
  }>;
};
