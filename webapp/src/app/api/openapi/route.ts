import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/lib/route-auth";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const filePath = path.join(process.cwd(), "public", "openapi.yaml");
  const source = await readFile(filePath, "utf8");
  const basePath = process.env.BASE_PATH ?? "";
  const yaml = source.replace("__BASE_PATH__", basePath || "/");

  return new Response(yaml, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
    },
  });
}
