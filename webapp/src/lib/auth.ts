import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import type { User } from "../../generated/prisma/client";
import { UserStatus } from "../../generated/prisma/enums";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/db";

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "role"
  | "status"
  | "themePreference"
  | "mustChangePassword"
  | "authMethod"
>;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export const PASSWORD_COMPLEXITY_REQUIREMENTS =
  "at least 8 characters, including at least 1 uppercase letter, 1 lowercase letter, and 1 number";

export function validatePasswordComplexity(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function getPasswordComplexityErrorMessage() {
  return `Password must contain ${PASSWORD_COMPLEXITY_REQUIREMENTS}.`;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const headerStore = await nextHeaders();
  const authSession = await auth.api.getSession({
    headers: new Headers(headerStore),
  });

  if (authSession?.user) {
    const freshUser = await prisma.user.findUnique({
      where: { id: authSession.user.id },
    });

    if (!freshUser || freshUser.status === UserStatus.INACTIVE) {
      return null;
    }

    return freshUser;
  }

  return null;
}

export async function requireSession() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.status === UserStatus.PENDING_APPROVAL) {
    redirect("/pending");
  }

  return user;
}
