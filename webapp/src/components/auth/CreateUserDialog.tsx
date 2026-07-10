"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Role } from "../../../generated/prisma/enums";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Form } from "@/components/ui/Form";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

const initialForm: {
  email: string;
  name: string;
  role: Role;
  temporaryPassword: string;
} = {
  email: "",
  name: "",
  role: Role.SCOPE_USER,
  temporaryPassword: "",
};

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const { pushToast } = useToast();
  const router = useRouter();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  function resetForm() {
    setForm(initialForm);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(withBasePath("/api/users"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast(payload.error ?? t("couldNotCreate"));
      return;
    }
    pushToast(t("userCreated"));
    resetForm();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <Card className="gap-4 rounded-lg border-[var(--border)] bg-[var(--panel)] py-0 shadow-none">
        <CardHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg tracking-tight">
            {t("createUser")}
          </CardTitle>
          <CardDescription>{t("createButton")}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <DialogTrigger asChild>
            <Button type="button">{t("createButton")}</Button>
          </DialogTrigger>
        </CardContent>
      </Card>

      <DialogContent className="max-w-xl rounded-lg border-[var(--border)] bg-[var(--panel)] dark:bg-[var(--panel)]">
        <DialogHeader>
          <DialogTitle>{t("createUser")}</DialogTitle>
          <DialogDescription>{t("createButton")}</DialogDescription>
        </DialogHeader>

        <Form className="mt-2" onSubmit={handleSubmit}>
          <Input
            placeholder={t("emailPlaceholder")}
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            required
          />
          <Input
            placeholder={t("namePlaceholder")}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
          <Select
            value={form.role}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, role: value as Role }))
            }
          >
            <SelectTrigger
              aria-label={t("role")}
              className="w-full rounded-lg border-[var(--border)] bg-white px-4 py-3 shadow-none dark:bg-[var(--panel)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-black/10 dark:border-white/10">
              {Object.values(Role).map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`roles.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t("temporaryPassword")}
            type="password"
            value={form.temporaryPassword}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                temporaryPassword: event.target.value,
              }))
            }
            required
          />
          <DialogFooter className="mt-2">
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="secondary"
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit">{t("createButton")}</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
