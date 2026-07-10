import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import { readCliReleaseAsset } from "@/services/api/cli-release-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ target: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { target } = await context.params;
  const asset = await readCliReleaseAsset(target);
  if (!asset) {
    return jsonError("CLI release artifact is not available.", 404);
  }

  return new Response(asset.buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${asset.filename}"`,
      "Content-Length": String(asset.buffer.byteLength),
      "Content-Type": asset.contentType,
    },
  });
}
