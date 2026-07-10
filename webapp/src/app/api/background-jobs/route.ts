import { requireApiUser, requireApiUserWithRoles } from "@/lib/route-auth";
import { Role } from "../../../../generated/prisma/enums";
import {
  createBackgroundJobForUser,
  listBackgroundJobsForUser,
} from "@/services/api/background-jobs";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const jobs = await listBackgroundJobsForUser(auth.user);

  return Response.json({
    jobs,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    jobType?: string;
    payload?: unknown;
  };
  const result = await createBackgroundJobForUser(auth.user.id, body);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ job: result.job }, { status: 201 });
}
