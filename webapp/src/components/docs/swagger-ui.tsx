"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => void;
  }
}

export function SwaggerUi() {
  useEffect(() => {
    const stylesheetId = "swagger-ui-styles";
    if (!document.getElementById(stylesheetId)) {
      const link = document.createElement("link");
      link.id = stylesheetId;
      link.rel = "stylesheet";
      link.href = withBasePath("/vendor/swagger-ui/swagger-ui.css");
      document.head.appendChild(link);
    }

    const mountSwagger = () => {
      window.SwaggerUIBundle?.({
        dom_id: "#swagger-ui",
        url: withBasePath("/api/openapi"),
        layout: "BaseLayout",
        deepLinking: true,
      });
    };

    const existingScript = document.getElementById(
      "swagger-ui-script",
    ) as HTMLScriptElement | null;
    if (existingScript) {
      if (window.SwaggerUIBundle) {
        mountSwagger();
      } else {
        existingScript.addEventListener("load", mountSwagger, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "swagger-ui-script";
    script.src = withBasePath("/vendor/swagger-ui/swagger-ui-bundle.js");
    script.async = true;
    script.addEventListener("load", mountSwagger, { once: true });
    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", mountSwagger);
    };
  }, []);

  return (
    <div
      className="min-h-[60vh] overflow-hidden rounded-lg border border-[var(--border)] bg-white p-4 text-black shadow-[0_18px_42px_-38px_var(--foreground)]"
      id="swagger-ui"
    />
  );
}
