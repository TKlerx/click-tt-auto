"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Form } from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { pushToast } = useToast();
  const t = useTranslations("auth");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const response = await fetch(withBasePath("/api/auth/change-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const payload = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      pushToast(payload.error ?? t("couldNotUpdatePassword"));
      return;
    }

    pushToast(t("passwordChanged"));
    window.location.assign(withBasePath("/dashboard"));
  }

  return (
    <Form className="mt-8" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium">
        {t("currentPassword")}
        <Input
          className="mt-2"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        {t("newPassword")}
        <Input
          className="mt-2"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
      </label>
      <Button className="w-full" disabled={submitting} type="submit">
        {submitting ? t("saving") : t("saveNewPassword")}
      </Button>
    </Form>
  );
}
