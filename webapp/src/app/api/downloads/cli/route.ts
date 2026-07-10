import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import {
  listCliReleaseAssets,
  readCliChecksums,
} from "@/services/api/cli-release-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const [assets, checksums] = await Promise.all([
      listCliReleaseAssets(),
      readCliChecksums(),
    ]);

    return Response.json({ assets, checksumsAvailable: Boolean(checksums) });
  } catch {
    return jsonError("Could not list CLI downloads", 500);
  }
}
