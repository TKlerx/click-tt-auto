import { useTranslations } from "next-intl";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default function ChangePasswordPage() {
  const t = useTranslations("auth");

  return (
    <AuthPageShell
      description={t("changePasswordDescription")}
      eyebrow={t("firstLogin")}
      title={t("changePassword")}
    >
      <ChangePasswordForm />
    </AuthPageShell>
  );
}
