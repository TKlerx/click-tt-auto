"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";
import { getRasterScopeLevel } from "@/lib/raster/scope-level";

export type ScopeAssignmentScope = {
  id: string;
  code: string;
  name: string;
  parent: {
    code: string;
    name: string;
    parent: { code: string; name: string } | null;
  } | null;
};

export function ScopeAssignmentDialog({
  userId,
  assignedScopes,
  availableScopes,
}: {
  userId: string;
  assignedScopes: ScopeAssignmentScope[];
  availableScopes: ScopeAssignmentScope[];
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [scopeId, setScopeId] = useState("");
  const [busyScopeId, setBusyScopeId] = useState<string | null>(null);

  const assignableScopes = useMemo(() => {
    const assigned = new Set(assignedScopes.map((scope) => scope.id));
    return availableScopes.filter((scope) => !assigned.has(scope.id));
  }, [assignedScopes, availableScopes]);

  async function updateScope(method: "POST" | "DELETE", nextScopeId: string) {
    setBusyScopeId(nextScopeId);
    try {
      const response = await fetch(
        withBasePath(`/api/users/${userId}/scopes`),
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeId: nextScopeId }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        pushToast(payload?.error ?? t("couldNotUpdate"));
        return;
      }

      pushToast(method === "POST" ? t("scopeGranted") : t("scopeRevoked"));
      setScopeId("");
      router.refresh();
    } finally {
      setBusyScopeId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <Plus className="size-4" aria-hidden="true" />
          {t("assignScope")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-lg border-[var(--border)] bg-[var(--panel)] dark:bg-[var(--panel)]">
        <DialogHeader>
          <DialogTitle>{t("scopes")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={scopeId} onValueChange={setScopeId}>
              <SelectTrigger
                aria-label={t("assignScope")}
                className="min-h-10 flex-1 rounded-lg border-[var(--border)] bg-white px-3 py-2 shadow-none dark:bg-[var(--panel)]"
              >
                <SelectValue placeholder={t("assignScope")} />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-[var(--border)]">
                {assignableScopes.map((scope) => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scopeLabel(scope, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!scopeId || busyScopeId === scopeId}
              onClick={() => void updateScope("POST", scopeId)}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("assignScope")}
            </Button>
          </div>

          <div className="space-y-2">
            {assignedScopes.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                {t("noScopes")}
              </p>
            ) : (
              assignedScopes.map((scope) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
                  key={scope.id}
                >
                  <span className="min-w-0 text-sm">
                    {scopeLabel(scope, t)}
                  </span>
                  <Button
                    className="shrink-0"
                    disabled={busyScopeId === scope.id}
                    onClick={() => void updateScope("DELETE", scope.id)}
                    type="button"
                    variant="secondary"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t("revokeScope")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            type="button"
            variant="secondary"
          >
            {tCommon("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function scopeLabel(
  scope: ScopeAssignmentScope,
  t: ReturnType<typeof useTranslations<"users">>,
) {
  const level = getRasterScopeLevel(scope);
  return `${t(`scopeLevels.${level === "bezirk" ? "bezirk" : "association"}`)}: ${rasterScopePath(scope)}`;
}

function rasterScopePath(scope: ScopeAssignmentScope) {
  return [scope.parent?.parent, scope.parent, scope]
    .filter((item): item is { code: string; name: string } => Boolean(item))
    .map((item) => item.name)
    .join(" / ");
}
