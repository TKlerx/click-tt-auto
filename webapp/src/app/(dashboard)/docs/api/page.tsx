import { SwaggerUi } from "@/components/docs/swagger-ui";
import { requireSession } from "@/lib/auth";
import { getTranslations } from "next-intl/server";

export default async function ApiDocsPage() {
  await requireSession();
  const t = await getTranslations("apiDocs");

  return (
    <section className="grid gap-6">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          OpenAPI
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)] sm:text-base">
          {t("description")}
        </p>
      </div>
      <SwaggerUi />
    </section>
  );
}
