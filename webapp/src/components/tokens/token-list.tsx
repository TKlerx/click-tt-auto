"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import {
  TokenValueDisplay,
  type TokenValuePayload,
} from "@/components/tokens/token-value-display";

type TokenItem = {
  id: string;
  name: string;
  tokenPrefix: string;
  type: string;
  status: string;
  expiresAt: string | Date;
  lastUsedAt: string | Date | null;
  revokedAt: string | Date | null;
  renewalCount: number;
  createdAt: string | Date;
  isExpired: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
  };
};

type UserFilterOption = {
  id: string;
  name: string;
  email: string;
};

function formatDate(value: string | Date | null) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TokenList({
  initialTokens,
  adminMode = false,
  users = [],
}: {
  initialTokens: TokenItem[];
  adminMode?: boolean;
  users?: UserFilterOption[];
}) {
  const t = useTranslations(adminMode ? "adminTokens" : "tokens");
  const sharedT = useTranslations("tokens");
  const router = useRouter();
  const { pushToast } = useToast();
  const [tokens, setTokens] = useState<TokenItem[]>(initialTokens);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renewedToken, setRenewedToken] = useState<TokenValuePayload | null>(
    null,
  );
  const [userIdFilter, setUserIdFilter] = useState<string>("all");

  useEffect(() => {
    if (adminMode) {
      return;
    }

    function handleTokenCreated(event: Event) {
      const payload = (event as CustomEvent<{ token?: TokenItem }>).detail;
      if (!payload?.token) {
        return;
      }

      setTokens((current) => {
        if (current.some((token) => token.id === payload.token!.id)) {
          return current;
        }

        return [payload.token!, ...current];
      });
    }

    window.addEventListener("tokens:created", handleTokenCreated);
    return () =>
      window.removeEventListener("tokens:created", handleTokenCreated);
  }, [adminMode]);

  async function refreshTokens(
    nextShowAll = showAll,
    nextUserId = userIdFilter,
  ) {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (nextShowAll) {
        params.set("showAll", "true");
      }
      if (adminMode && nextUserId !== "all") {
        params.set("userId", nextUserId);
      }

      const url = adminMode ? "/api/admin/tokens" : "/api/tokens";
      const response = await fetch(withBasePath(`${url}?${params.toString()}`));
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        tokens?: TokenItem[];
      } | null;

      if (!response.ok || !payload?.tokens) {
        pushToast(payload?.error ?? sharedT("loadFailed"));
        return;
      }

      setTokens(payload.tokens);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function runAction(
    token: TokenItem,
    action: "revoke" | "renew" | "delete",
  ) {
    const confirmationKey = `${action}Confirm`;
    if (!window.confirm(sharedT(confirmationKey))) {
      return;
    }

    setBusyId(`${token.id}:${action}`);

    try {
      const baseUrl = adminMode
        ? `/api/admin/tokens/${token.id}`
        : `/api/tokens/${token.id}`;
      const requestUrl =
        action === "revoke"
          ? `${baseUrl}/revoke`
          : action === "renew"
            ? `${baseUrl}/renew`
            : baseUrl;

      const response = await fetch(withBasePath(requestUrl), {
        method: action === "delete" ? "DELETE" : "POST",
        headers:
          action === "renew"
            ? {
                "Content-Type": "application/json",
              }
            : undefined,
        body:
          action === "renew"
            ? JSON.stringify({ expiresInDays: 90 })
            : undefined,
      });

      const payload =
        response.status === 204
          ? null
          : await response.json().catch(() => null);
      if (!response.ok) {
        pushToast(payload?.error ?? sharedT("updateFailed"));
        return;
      }

      if (action === "renew" && payload?.token?.tokenValue) {
        setRenewedToken({
          name: payload.token.name ?? token.name,
          tokenValue: payload.token.tokenValue,
        });
      }

      pushToast(
        action === "revoke"
          ? sharedT("revoked")
          : action === "renew"
            ? sharedT("renewed")
            : sharedT("deleted"),
      );
      await refreshTokens();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t("tableTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {t("tableDescription")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {adminMode ? (
              <Select
                onValueChange={(value) => {
                  setUserIdFilter(value);
                  void refreshTokens(showAll, value);
                }}
                value={userIdFilter}
              >
                <SelectTrigger
                  aria-label={t("filterByUser")}
                  className="w-[18rem] rounded-lg border-[var(--border)] bg-white px-3 py-2 shadow-none dark:bg-[var(--panel)]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg border-[var(--border)]">
                  <SelectItem value="all">{t("allUsers")}</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={showAll}
                className="size-4 rounded"
                onChange={(event) => {
                  const next = event.target.checked;
                  setShowAll(next);
                  void refreshTokens(next);
                }}
                type="checkbox"
              />
              {sharedT("showAll")}
            </label>
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
            {sharedT("empty")}
          </div>
        ) : (
          <>
            <div className="mt-6 hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {adminMode ? <TableHead>{t("user")}</TableHead> : null}
                    <TableHead>{sharedT("nameColumn")}</TableHead>
                    <TableHead>{sharedT("prefixColumn")}</TableHead>
                    <TableHead>{sharedT("typeColumn")}</TableHead>
                    <TableHead>{sharedT("statusColumn")}</TableHead>
                    <TableHead>{sharedT("expiresColumn")}</TableHead>
                    <TableHead>{sharedT("lastUsedColumn")}</TableHead>
                    <TableHead>{sharedT("createdColumn")}</TableHead>
                    <TableHead>{sharedT("actionsColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.id}>
                      {adminMode ? (
                        <TableCell>
                          <div className="font-medium">
                            {token.user?.name ?? "—"}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {token.user?.email ?? "—"}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium">
                        {token.name}
                      </TableCell>
                      <TableCell>{token.tokenPrefix}</TableCell>
                      <TableCell>{token.type}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">
                          {token.isExpired
                            ? sharedT("statusExpired")
                            : sharedT(`status.${token.status}`)}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(token.expiresAt)}</TableCell>
                      <TableCell>{formatDate(token.lastUsedAt)}</TableCell>
                      <TableCell>{formatDate(token.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {!adminMode &&
                          token.status === "ACTIVE" &&
                          !token.isExpired ? (
                            <Button
                              disabled={busyId === `${token.id}:renew`}
                              onClick={() => void runAction(token, "renew")}
                              type="button"
                              variant="secondary"
                            >
                              {sharedT("renew")}
                            </Button>
                          ) : null}
                          {token.status === "ACTIVE" && !token.isExpired ? (
                            <Button
                              disabled={busyId === `${token.id}:revoke`}
                              onClick={() => void runAction(token, "revoke")}
                              type="button"
                              variant="secondary"
                            >
                              {sharedT("revoke")}
                            </Button>
                          ) : null}
                          <Button
                            disabled={busyId === `${token.id}:delete`}
                            onClick={() => void runAction(token, "delete")}
                            type="button"
                            variant="secondary"
                          >
                            {sharedT("delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6 grid gap-4 md:hidden">
              {tokens.map((token) => (
                <article
                  className="rounded-lg border border-[var(--border)] p-4"
                  key={token.id}
                >
                  {adminMode ? (
                    <p className="text-sm font-medium">
                      {token.user?.name}{" "}
                      <span className="text-[var(--muted-foreground)]">
                        ({token.user?.email})
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{token.name}</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {sharedT("prefixColumn")}: {token.tokenPrefix}
                      </p>
                    </div>
                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">
                      {token.isExpired
                        ? sharedT("statusExpired")
                        : sharedT(`status.${token.status}`)}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted-foreground)]">
                        {sharedT("typeColumn")}
                      </dt>
                      <dd>{token.type}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted-foreground)]">
                        {sharedT("expiresColumn")}
                      </dt>
                      <dd>{formatDate(token.expiresAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted-foreground)]">
                        {sharedT("lastUsedColumn")}
                      </dt>
                      <dd>{formatDate(token.lastUsedAt)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!adminMode &&
                    token.status === "ACTIVE" &&
                    !token.isExpired ? (
                      <Button
                        onClick={() => void runAction(token, "renew")}
                        type="button"
                        variant="secondary"
                      >
                        {sharedT("renew")}
                      </Button>
                    ) : null}
                    {token.status === "ACTIVE" && !token.isExpired ? (
                      <Button
                        onClick={() => void runAction(token, "revoke")}
                        type="button"
                        variant="secondary"
                      >
                        {sharedT("revoke")}
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => void runAction(token, "delete")}
                      type="button"
                      variant="secondary"
                    >
                      {sharedT("delete")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            {sharedT("loading")}
          </p>
        ) : null}
      </section>

      <TokenValueDisplay
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRenewedToken(null);
          }
        }}
        open={Boolean(renewedToken)}
        token={renewedToken}
      />
    </>
  );
}
