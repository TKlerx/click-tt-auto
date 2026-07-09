import type { InputHTMLAttributes } from "react";
import { Input as ShadcnInput } from "@/components/shadcn/input";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <ShadcnInput
      className={cn(
        "min-h-11 rounded-lg border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-none transition duration-200 placeholder:text-[color:color-mix(in_srgb,var(--muted-foreground)_72%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className,
      )}
      {...props}
    />
  );
}
