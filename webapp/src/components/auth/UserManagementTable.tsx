"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  AuthMethod,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import {
  Role as RoleEnum,
  UserStatus as UserStatusEnum,
} from "../../../generated/prisma/enums";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { withBasePath } from "@/lib/base-path";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  ScopeAssignmentDialog,
  type ScopeAssignmentScope,
} from "@/components/auth/ScopeAssignmentDialog";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  authMethod: AuthMethod;
  scopes: ScopeAssignmentScope[];
};

export function UserManagementTable({
  canManageStatus = true,
  currentUserId,
  roleOptions = Object.values(RoleEnum),
  users,
  availableScopes,
}: {
  canManageStatus?: boolean;
  currentUserId: string;
  roleOptions?: Role[];
  users: UserRow[];
  availableScopes: ScopeAssignmentScope[];
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const t = useTranslations("users");

  async function runAction(
    key: string,
    url: string,
    options: RequestInit,
    successMessage: string,
  ) {
    setBusyKey(key);

    try {
      const response = await fetch(withBasePath(url), options);
      const payload =
        response.status === 204
          ? null
          : await response.json().catch(() => null);

      if (!response.ok) {
        pushToast(mapUserError(payload?.error, t));
        return;
      }

      pushToast(successMessage);
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            <th className="px-4 py-3 sm:px-6">{t("name")}</th>
            <th className="px-4 py-3">{t("email")}</th>
            <th className="px-4 py-3">{t("role")}</th>
            <th className="px-4 py-3">{t("scopeColumn")}</th>
            <th className="px-4 py-3">{t("statusLabel")}</th>
            <th className="px-4 py-3">{t("auth")}</th>
            <th className="px-4 py-3 sm:px-6">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((entry) => {
            const canEditSelfRole = entry.id !== currentUserId;
            const isBusy = busyKey?.startsWith(entry.id);

            return (
              <tr
                className="border-b border-[var(--border)] align-top transition-colors last:border-b-0 hover:bg-[color:color-mix(in_srgb,var(--panel)_86%,var(--background)_14%)]"
                key={entry.id}
              >
                <td className="px-4 py-4 sm:px-6">
                  <div className="font-medium">{entry.name}</div>
                </td>
                <td className="px-4 py-4 text-[var(--muted-foreground)]">
                  {entry.email}
                </td>
                <td className="px-4 py-4">
                  <Select
                    disabled={!canEditSelfRole || Boolean(isBusy)}
                    value={entry.role}
                    onValueChange={(value) =>
                      void runAction(
                        `${entry.id}-role`,
                        `/api/users/${entry.id}/role`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ role: value }),
                        },
                        t("roleUpdated", { role: t(`roles.${value as Role}`) }),
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={t("role")}
                      className="w-[13rem] rounded-lg border-[var(--border)] bg-white px-3 py-2 shadow-none dark:bg-[var(--panel)]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-[var(--border)]">
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-4">
                  <div className="flex max-w-[18rem] flex-wrap gap-1">
                    {entry.scopes.length === 0 ? (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {t("noScopes")}
                      </span>
                    ) : (
                      entry.scopes.map((scope) => (
                        <span
                          className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-xs font-semibold text-[var(--secondary-foreground)]"
                          key={scope.id}
                        >
                          {scope.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-3 py-1 text-xs font-semibold text-[var(--secondary-foreground)]">
                    {t(`statuses.${entry.status}`)}
                  </span>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-[var(--muted-foreground)]">
                  {entry.authMethod}
                </td>
                <td className="px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap gap-2">
                    <ScopeAssignmentDialog
                      assignedScopes={entry.scopes}
                      availableScopes={availableScopes}
                      userId={entry.id}
                    />

                    {canManageStatus &&
                    entry.status === UserStatusEnum.PENDING_APPROVAL ? (
                      <Button
                        disabled={Boolean(isBusy)}
                        onClick={() =>
                          void runAction(
                            `${entry.id}-approve`,
                            `/api/users/${entry.id}/approve`,
                            { method: "PATCH" },
                            t("userApproved"),
                          )
                        }
                        type="button"
                        variant="secondary"
                      >
                        {t("approve")}
                      </Button>
                    ) : null}

                    {canManageStatus &&
                    entry.status === UserStatusEnum.ACTIVE ? (
                      <Button
                        disabled={Boolean(isBusy)}
                        onClick={() =>
                          void runAction(
                            `${entry.id}-deactivate`,
                            `/api/users/${entry.id}/deactivate`,
                            { method: "PATCH" },
                            t("userDeactivated"),
                          )
                        }
                        type="button"
                        variant="secondary"
                      >
                        {t("deactivate")}
                      </Button>
                    ) : null}

                    {canManageStatus &&
                    entry.status === UserStatusEnum.INACTIVE ? (
                      <Button
                        disabled={Boolean(isBusy)}
                        onClick={() =>
                          void runAction(
                            `${entry.id}-reactivate`,
                            `/api/users/${entry.id}/reactivate`,
                            { method: "PATCH" },
                            t("userReactivated"),
                          )
                        }
                        type="button"
                        variant="secondary"
                      >
                        {t("reactivate")}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function mapUserError(
  error: unknown,
  t: ReturnType<typeof useTranslations<"users">>,
) {
  if (typeof error !== "string") {
    return t("couldNotUpdate");
  }

  if (error === "Cannot deactivate the last Admin user") {
    return t("lastAdminDeactivateError");
  }

  if (error === "Cannot change role of the last Admin user") {
    return t("lastAdminRoleError");
  }

  return error;
}
