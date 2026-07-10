import { useTranslations } from "next-intl";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  return (
    <AuthPageShell
      description={t("description")}
      eyebrow={tCommon("appName")}
      title={t("signIn")}
    >
      <LoginForm />
    </AuthPageShell>
  );
}
