"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";
import { Role } from "../../../generated/prisma/enums";
import {
  UserManagementTable,
  type UserRow,
} from "@/components/auth/UserManagementTable";
import type { ScopeAssignmentScope } from "@/components/auth/ScopeAssignmentDialog";

export function UserLookupPanel({
  currentUserId,
  availableScopes,
}: {
  currentUserId: string;
  availableScopes: ScopeAssignmentScope[];
}) {
  const t = useTranslations("users");
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(
        withBasePath(`/api/users/lookup?email=${encodeURIComponent(email)}`),
      );
      const payload = (await response.json().catch(() => null)) as {
        user?: UserRow | null;
        error?: string;
      } | null;
      if (!response.ok) {
        pushToast(payload?.error ?? t("couldNotUpdate"));
        return;
      }

      setUsers(payload?.user ? [payload.user] : []);
      if (!payload?.user) {
        pushToast(t("noUserFound"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <form className="flex gap-2" onSubmit={lookup}>
        <Input
          aria-label={t("email")}
          placeholder={t("emailPlaceholder")}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button disabled={busy} type="submit">
          <Search className="size-4" aria-hidden="true" />
          {t("lookupUser")}
        </Button>
      </form>
      <p className="text-sm text-[var(--muted-foreground)]">
        {t("accessLookupOnly")}
      </p>
      {users.length ? (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <UserManagementTable
            availableScopes={availableScopes}
            canManageStatus={false}
            currentUserId={currentUserId}
            roleOptions={[Role.SCOPE_USER, Role.SCOPE_ADMIN]}
            users={users}
          />
        </section>
      ) : null}
    </section>
  );
}
