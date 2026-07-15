import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { importSnapshot } from "@/services/raster";
import {
  AssignmentStatus,
  AuditAction,
  RasterWeekday,
} from "../../../../../../generated/prisma/enums";
import { z } from "zod";

const assignmentSchema = z.object({
  league: z.string().trim().min(1),
  group: z.string().trim().min(1),
  clubId: z.string().trim().min(1),
  clubName: z.string().trim().min(1),
  team: z.string().trim().min(1),
  rasterzahl: z.coerce.number().int().min(1),
  status: z.enum([
    AssignmentStatus.OPTIMIZED,
    AssignmentStatus.FIXED,
    AssignmentStatus.PINNED,
    AssignmentStatus.MISSING,
  ]),
  weekday: z.enum([
    RasterWeekday.MONDAY,
    RasterWeekday.TUESDAY,
    RasterWeekday.WEDNESDAY,
    RasterWeekday.THURSDAY,
    RasterWeekday.FRIDAY,
    RasterWeekday.SATURDAY,
    RasterWeekday.SUNDAY,
  ]),
  hall: z.string().trim().min(1),
  startTime: z.string().trim().optional(),
  weekSlot: z.string().trim().optional(),
});

const conflictSchema = z.object({
  matchWeek: z.coerce.number().int().min(1),
  clubId: z.string().trim().min(1),
  clubName: z.string().trim().min(1),
  weekday: assignmentSchema.shape.weekday,
  hall: z.string().trim().min(1),
  capacity: z.coerce.number().int().min(0),
  actualCount: z.coerce.number().int().min(0),
  excess: z.coerce.number().int().min(0),
  teams: z.union([z.string(), z.array(z.string())]),
});

const bodySchema = z.object({
  scope: z.string().trim().min(1),
  objectiveBreakdown: z.record(z.string(), z.unknown()).optional(),
  assignments: z.array(assignmentSchema),
  conflicts: z.array(conflictSchema).default([]),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid snapshot import" },
      { status: 422 },
    );
  }

  const access = await assertRasterAccess(
    auth.user,
    parsed.data.scope,
    "admin",
  );
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(parsed.data.scope);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const snapshot = await importSnapshot({
    scopeId: scope.id,
    objectiveBreakdown: JSON.stringify(parsed.data.objectiveBreakdown ?? {}),
    assignments: parsed.data.assignments,
    conflicts: parsed.data.conflicts.map((conflict) => ({
      ...conflict,
      teams: Array.isArray(conflict.teams)
        ? JSON.stringify(conflict.teams)
        : conflict.teams,
    })),
  });
  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: auth.user.id,
    scope: parsed.data.scope,
    entityType: "RasterSnapshot",
    entityId: snapshot.id,
    details: {
      inputType: "snapshot_import",
      assignmentCount: parsed.data.assignments.length,
      conflictCount: parsed.data.conflicts.length,
    },
  });

  return NextResponse.json(
    {
      snapshot,
      warnings:
        parsed.data.assignments.length === 0
          ? ["Imported snapshot has no assignments."]
          : [],
    },
    { status: 201 },
  );
}
