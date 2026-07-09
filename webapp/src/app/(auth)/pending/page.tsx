import { Button } from "@/components/ui/Button";
import { withBasePath } from "@/lib/base-path";
import { getTranslations } from "next-intl/server";

export default async function PendingPage() {
  const t = await getTranslations("pending");
  const tCommon = await getTranslations("common");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-12 sm:px-6 sm:py-16">
      <section className="rounded-2xl border border-amber-300/50 bg-amber-50 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.08)] sm:p-10 dark:border-amber-500/30 dark:bg-amber-900/20">
        <p className="text-sm uppercase tracking-[0.2em] text-amber-800/60 dark:text-amber-400/60">
          {t("label")}
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-amber-950 sm:text-4xl dark:text-amber-100">
          {t("title")}
        </h1>
        <p className="mt-4 text-base text-amber-900/80 dark:text-amber-200/80">
          {t("description")}
        </p>
        <form
          action={withBasePath("/api/auth/logout")}
          className="mt-8"
          method="post"
        >
          <Button type="submit" variant="secondary">
            {tCommon("signOut")}
          </Button>
        </form>
      </section>
    </main>
  );
}
