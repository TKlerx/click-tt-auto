"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { withBasePath } from "@/lib/base-path";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/components/ui/Toast";
import {
  TokenValueDisplay,
  type TokenValuePayload,
} from "@/components/tokens/token-value-display";

const EXPIRY_OPTIONS = [7, 30, 60, 90, 180, 365];

export function CreateTokenDialog() {
  const router = useRouter();
  const t = useTranslations("tokens");
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [submitting, setSubmitting] = useState(false);
  const [createdToken, setCreatedToken] = useState<TokenValuePayload | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(withBasePath("/api/tokens"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          expiresInDays: Number(expiresInDays),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        token?: {
          id: string;
          name: string;
          tokenValue: string;
          tokenPrefix: string;
          type: string;
          expiresAt: string | Date;
          createdAt: string | Date;
        };
      } | null;

      if (!response.ok || !payload?.token) {
        pushToast(payload?.error ?? t("createFailed"));
        return;
      }

      pushToast(t("created"));
      setCreatedToken({
        name: payload.token.name,
        tokenValue: payload.token.tokenValue,
      });
      window.dispatchEvent(
        new CustomEvent("tokens:created", {
          detail: {
            token: {
              id: payload.token.id,
              name: payload.token.name,
              tokenPrefix: payload.token.tokenPrefix,
              type: payload.token.type,
              status: "ACTIVE",
              expiresAt: payload.token.expiresAt,
              lastUsedAt: null,
              revokedAt: null,
              renewalCount: 0,
              createdAt: payload.token.createdAt,
              isExpired: false,
            },
          },
        }),
      );
      setOpen(false);
      setName("");
      setExpiresInDays("90");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 text-left shadow-[0_18px_42px_-38px_var(--foreground)] transition hover:-translate-y-0.5"
            type="button"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              {t("eyebrow")}
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{t("title")}</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {t("description")}
            </p>
            <span className="mt-5 inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)]">
              {t("create")}
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="rounded-lg border-[var(--border)] bg-[var(--panel)] p-6">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="token-name">
                {t("nameLabel")}
              </label>
              <Input
                id="token-name"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="token-expiry">
                {t("expiryLabel")}
              </label>
              <Select onValueChange={setExpiresInDays} value={expiresInDays}>
                <SelectTrigger
                  aria-label={t("expiryLabel")}
                  className="w-full rounded-lg border-[var(--border)] bg-white px-3 py-3 shadow-none dark:bg-[var(--panel)]"
                  id="token-expiry"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg border-[var(--border)]">
                  {EXPIRY_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value.toString()}>
                      {t(`expiryOptions.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                {t("cancel")}
              </Button>
              <Button disabled={submitting} type="submit">
                {submitting ? t("creating") : t("create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <TokenValueDisplay
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreatedToken(null);
          }
        }}
        open={Boolean(createdToken)}
        token={createdToken}
      />
    </>
  );
}
