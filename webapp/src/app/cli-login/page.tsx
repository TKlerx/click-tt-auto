import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { getConfiguredBasePath } from "@/lib/azure-auth";
import {
  CLI_AUTH_CSRF_QUERY_PARAM,
  getCliAuthCodeForApproval,
} from "@/services/api/cli-auth";

function getCallbackLabel(callbackUrl: string) {
  try {
    const parsed = new URL(callbackUrl);
    return `${parsed.hostname}:${parsed.port || "80"}`;
  } catch {
    return "localhost";
  }
}

function CliLoginError({ message, title }: { message: string; title: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-[var(--panel)] p-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-white/10">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-45">
        CLI
      </p>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm opacity-75">{message}</p>
    </div>
  );
}

export default async function CliLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    approval?: string;
    error?: string;
    request?: string;
  }>;
}) {
  await requireSession();
  const t = await getTranslations("cliLogin");
  const params = await searchParams;
  const { error, request } = params;
  const approval = params[CLI_AUTH_CSRF_QUERY_PARAM];

  if (error || !request || !approval) {
    return (
      <CliLoginError message={t("errorMessage")} title={t("errorTitle")} />
    );
  }

  const authCode = await getCliAuthCodeForApproval(request);
  if (!authCode) {
    return (
      <CliLoginError message={t("errorMessage")} title={t("errorTitle")} />
    );
  }

  return (
    <form
      action={`${getConfiguredBasePath()}/api/cli-auth/approve`}
      className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-[var(--panel)] p-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-white/10"
      method="post"
    >
      <input name="request" type="hidden" value={authCode.id} />
      <input name="csrfToken" type="hidden" value={approval} />
      <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-45">
        CLI
      </p>
      <h1 className="mt-4 text-3xl font-semibold">{t("confirmTitle")}</h1>
      <p className="mt-3 text-sm opacity-75">
        {t("confirmMessage", {
          callback: getCallbackLabel(authCode.callbackUrl),
        })}
      </p>
      <div className="mt-6 flex justify-center">
        <button
          className="min-h-10 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] shadow-sm shadow-[0_14px_28px_-18px_var(--accent)] transition duration-200 ease-out hover:brightness-105 active:translate-y-px"
          type="submit"
        >
          {t("approve")}
        </button>
      </div>
    </form>
  );
}
