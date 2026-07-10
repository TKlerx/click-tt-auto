import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/file-storage";
import { upsertRasterSource } from "@/services/raster";

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const scopeCode = String(formData.get("scopeCode") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const file = formData.get("file");
  if (!scopeCode || !sourceType || !displayName || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid source upload" }, { status: 422 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "admin");
  if (access !== true) return access.error;

  const scope = await prisma.scope.findFirst({
    where: { OR: [{ code: scopeCode }, { name: scopeCode }] },
    select: { id: true },
  });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const sourceRef = await saveFile(
    Buffer.from(await file.arrayBuffer()),
    file.name || "source.bin",
  );
  return NextResponse.json(
    {
      source: await upsertRasterSource({
        scopeId: scope.id,
        sourceType,
        sourceRef,
        displayName,
      }),
    },
    { status: 201 },
  );
}
