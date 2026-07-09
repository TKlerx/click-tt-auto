"use client";

import type { PropsWithChildren, ReactNode } from "react";

type AuthPageShellProps = PropsWithChildren<{
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
}>;

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,0.7fr)] lg:items-center lg:px-8">
      <section className="max-w-2xl lg:pb-14">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {eyebrow}
        </p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-pretty sm:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-[58ch] text-base leading-7 text-[var(--muted-foreground)]">
          {description}
        </p>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_94%,transparent)] p-5 shadow-[0_30px_80px_-56px_var(--foreground)] backdrop-blur-xl sm:p-7">
        {children}
      </section>
    </main>
  );
}
