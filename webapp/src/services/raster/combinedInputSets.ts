import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAccessibleRasterScopes } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";

export async function createCombinedInputSet(params: {
  user: Pick<SessionUser, "id" | "role">;
  scopeIds: string[];
  ownerScopeId: string;
  season: string;
  name: string;
}) {
  const scopeIds = [...new Set(params.scopeIds)];
  if (scopeIds.length < 2) {
    throw new Error("Combined input sets require at least two scopes");
  }
  if (!scopeIds.includes(params.ownerScopeId)) {
    throw new Error("Owner scope must be included in the combined selection");
  }

  const accessibleScopeIds = new Set(
    (await listAccessibleRasterScopes(params.user)).map((scope) => scope.id),
  );
  const inaccessibleScopeId = scopeIds.find(
    (id) => !accessibleScopeIds.has(id),
  );
  if (inaccessibleScopeId) {
    throw new Error("Not authorized for one or more selected scopes");
  }

  return prisma.$transaction(async (tx) => {
    const inputSet = await tx.rasterInputSet.create({
      data: {
        name: params.name,
        scopeId: params.ownerScopeId,
        season: normalizeRasterSeason(params.season),
        createdById: params.user.id,
      },
    });
    await tx.rasterInputSetScope.createMany({
      data: scopeIds.map((scopeId) => ({ inputSetId: inputSet.id, scopeId })),
    });
    return inputSet;
  });
}
