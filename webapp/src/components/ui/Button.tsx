import type { ButtonHTMLAttributes } from "react";
import { Button as ShadcnButton } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <ShadcnButton
      className={cn(
        "min-h-10 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition duration-200 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-55",
        variant === "primary"
          ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_14px_28px_-18px_var(--accent)] hover:brightness-105"
          : "border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:border-[color:color-mix(in_srgb,var(--border)_70%,var(--foreground)_30%)] hover:bg-[color:color-mix(in_srgb,var(--panel)_92%,var(--foreground)_8%)] dark:hover:bg-[color:color-mix(in_srgb,var(--panel)_88%,white_12%)]",
        className,
      )}
      variant={variant === "primary" ? "default" : "outline"}
      {...props}
    />
  );
}
