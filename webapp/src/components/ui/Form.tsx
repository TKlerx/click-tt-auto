import type { FormHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Form({
  className,
  method = "post",
  ...props
}: PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>) {
  return (
    <form className={cn("space-y-4", className)} method={method} {...props} />
  );
}
