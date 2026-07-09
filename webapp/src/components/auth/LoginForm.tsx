"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Form } from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const formReady = useSyncExternalStore(
    emptySubscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const t = useTranslations("auth");
  const redirectTo = searchParams.get("redirectTo");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setLoginError(null);

    try {
      const response = await fetch(withBasePath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, redirectTo }),
      });

      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      setLoading(false);

      if (!response.ok) {
        const errorMessage = payload.error ?? t("loginFailed");
        setLoginError(errorMessage);
        pushToast(errorMessage);
        return;
      }

      router.push(payload.redirectTo ?? "/dashboard");
    } catch {
      setLoading(false);
      setLoginError(t("loginFailed"));
      pushToast(t("loginFailed"));
    }
  }

  return (
    <>
      {searchParams.get("error") ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--destructive)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--destructive)_10%,var(--panel))] px-4 py-3 text-sm text-[var(--destructive)]">
          {searchParams.get("error") === "revoked"
            ? t("ssoRevoked")
            : searchParams.get("error") === "sso-config"
              ? t("ssoNotConfigured")
              : t("authFailed")}
        </div>
      ) : null}

      {loginError ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--destructive)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--destructive)_10%,var(--panel))] px-4 py-3 text-sm text-[var(--destructive)]">
          {loginError}
        </div>
      ) : null}

      <div className="mt-1">
        <a
          href={withBasePath(
            redirectTo
              ? `/api/auth/sso/azure?redirectTo=${encodeURIComponent(redirectTo)}`
              : "/api/auth/sso/azure",
          )}
        >
          <Button className="w-full" type="button">
            {t("signInAzure")}
          </Button>
        </a>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
        <span className="h-px flex-1 bg-current" />
        <span>{t("localAccount")}</span>
        <span className="h-px flex-1 bg-current" />
      </div>

      {formReady ? (
        <Form onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium" htmlFor="login-email">
              {t("email")}
            </label>
            <Input
              id="login-email"
              className="mt-2"
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              suppressHydrationWarning
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (loginError) {
                  setLoginError(null);
                }
              }}
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium"
              htmlFor="login-password"
            >
              {t("password")}
            </label>
            <Input
              id="login-password"
              className="mt-2"
              type="password"
              name="password"
              autoComplete="current-password"
              suppressHydrationWarning
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (loginError) {
                  setLoginError(null);
                }
              }}
              required
            />
          </div>
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </Form>
      ) : (
        <div aria-hidden="true" className="space-y-4">
          <div>
            <div className="h-5 w-14 rounded bg-[color:color-mix(in_srgb,var(--muted-foreground)_18%,transparent)]" />
            <div className="mt-2 h-11 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
          </div>
          <div>
            <div className="h-5 w-20 rounded bg-[color:color-mix(in_srgb,var(--muted-foreground)_18%,transparent)]" />
            <div className="mt-2 h-11 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
          </div>
          <div className="h-11 rounded-lg bg-[color:color-mix(in_srgb,var(--primary)_34%,var(--panel))]" />
        </div>
      )}
    </>
  );
}
