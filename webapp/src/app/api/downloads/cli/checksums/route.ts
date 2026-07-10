import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import { readCliChecksums } from "@/services/api/cli-release-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const checksums = await readCliChecksums();
  if (!checksums) {
    return jsonError("CLI checksums are not available.", 404);
  }

  return new Response(checksums, {
    headers: {
      "Content-Disposition": 'attachment; filename="starterctl-checksums.txt"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
