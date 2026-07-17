import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { syncInputSetSourceCaches } from "@/services/raster/inputSets";
import {
  AssignmentStatus,
  AuthMethod,
  InputSetStatus,
  NotificationEventType,
  NotificationStatus,
  OptimizationRunOutcome,
  OptimizationRunStatus,
  Role,
  SnapshotOptimality,
  SnapshotOrigin,
  ThemePreference,
  UserStatus,
  type AuditAction,
} from "../../../generated/prisma/enums";
import type { Prisma } from "../../../generated/prisma/client";

type Operation =
  | "seedLocalUser"
  | "seedSsoUser"
  | "findUserByEmail"
  | "updateUserStatus"
  | "deactivatePlatformAdminsExcept"
  | "assignUserToScope"
  | "seedRasterScopeHierarchy"
  | "seedRasterSource"
  | "seedRasterProjectionFixture"
  | "seedRasterCombinedReviewFixture"
  | "addAuditEntryFixture"
  | "seedBackgroundJob"
  | "seedNotificationTypeConfiguration"
  | "seedNotificationFixture";

function normalizeEmail(email: string) {
  return email.toLowerCase();
}

const wttvDistricts = [
  ["NIEDERRHEIN", "Niederrhein"],
  ["RHEIN_RUHR", "Rhein-Ruhr"],
  ["RHEIN_WUPPER", "Rhein-Wupper"],
  ["KOELN", "Köln"],
  ["RHEIN_ERFT_SIEG", "Rhein-Erft-Sieg"],
  ["AACHEN_EUREGIO", "Aachen/Euregio"],
  ["MUENSTERLAND", "Münsterland"],
  ["MUENSTERLAND_HOHE_MARK", "Münsterland/Hohe Mark"],
  ["OSTWESTFALEN_NORD", "Ostwestfalen-Nord"],
  ["OWL", "Ostwestfalen/Lippe"],
  ["MITTLERES_RUHRGEBIET", "Mittleres Ruhrgebiet"],
  ["WESTFALEN_MITTE", "Westfalen-Mitte"],
  ["SUEDWESTFALEN", "Südwestfalen"],
] as const;

async function readJson<T>() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return (input ? JSON.parse(input) : {}) as T;
}

function assignment(
  scopeId: string,
  clubName: string,
  team: string,
  idSuffix: string,
): Omit<Prisma.RasterAssignmentCreateManyInput, "snapshotId"> {
  return {
    id: `e2e-assignment-${idSuffix}`,
    league: "Liga",
    group: "Gruppe 1",
    clubId: `${scopeId}:club-${idSuffix}`,
    clubName,
    team,
    rasterzahl: 1,
    status: AssignmentStatus.OPTIMIZED,
    weekday: "FRIDAY",
    hall: "1",
    startTime: "19:30",
    weekSlot: "A",
  };
}

async function createSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    scopeId: string;
    spannedScopeIds?: string[];
    assignments: Array<
      Omit<Prisma.RasterAssignmentCreateManyInput, "snapshotId">
    >;
  },
) {
  const snapshot = await tx.rasterSnapshot.create({
    data: {
      runId: input.runId,
      scopeId: input.scopeId,
      origin: SnapshotOrigin.GENERATED,
      optimality: SnapshotOptimality.PROVEN_OPTIMAL,
      objectiveBreakdown: "{}",
      spannedScopes: input.spannedScopeIds?.length
        ? { create: input.spannedScopeIds.map((scopeId) => ({ scopeId })) }
        : undefined,
    },
    select: { id: true },
  });
  await tx.rasterAssignment.createMany({
    data: input.assignments.map((row) => ({
      ...row,
      snapshotId: snapshot.id,
    })),
  });
  return snapshot;
}

// eslint-disable-next-line complexity, max-lines-per-function, sonarjs/cognitive-complexity
async function main() {
  const operation = process.argv[2] as Operation | undefined;
  if (!operation) {
    throw new Error("Missing db worker operation");
  }

  switch (operation) {
    case "seedLocalUser": {
      const user = await readJson<{
        email: string;
        name: string;
        role: Role;
        password: string;
        mustChangePassword: boolean;
        status?: UserStatus;
      }>();
      const normalizedEmail = normalizeEmail(user.email);
      const passwordHash = await bcrypt.hash(user.password, 12);

      const record = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name,
          role: user.role,
          status: user.status ?? UserStatus.ACTIVE,
          authMethod: AuthMethod.LOCAL,
          mustChangePassword: user.mustChangePassword,
          themePreference: ThemePreference.LIGHT,
          sessions: {
            deleteMany: {},
          },
        },
        create: {
          email: normalizedEmail,
          name: user.name,
          role: user.role,
          status: user.status ?? UserStatus.ACTIVE,
          authMethod: AuthMethod.LOCAL,
          mustChangePassword: user.mustChangePassword,
          themePreference: ThemePreference.LIGHT,
          locale: "en",
        },
        select: {
          id: true,
        },
      });

      await prisma.account.upsert({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: normalizedEmail,
          },
        },
        update: {
          userId: record.id,
          password: passwordHash,
        },
        create: {
          accountId: normalizedEmail,
          providerId: "credential",
          userId: record.id,
          password: passwordHash,
        },
      });

      process.stdout.write(JSON.stringify(record.id));
      break;
    }

    case "seedSsoUser": {
      const user = await readJson<{
        email: string;
        name: string;
        role?: Role;
        status: UserStatus;
        authMethod?: AuthMethod;
      }>();
      const normalizedEmail = normalizeEmail(user.email);
      const record = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name,
          role: user.role ?? Role.SCOPE_USER,
          status: user.status,
          authMethod: user.authMethod ?? AuthMethod.SSO,
          mustChangePassword: false,
          themePreference: ThemePreference.LIGHT,
          sessions: {
            deleteMany: {},
          },
        },
        create: {
          email: normalizedEmail,
          name: user.name,
          role: user.role ?? Role.SCOPE_USER,
          status: user.status,
          authMethod: user.authMethod ?? AuthMethod.SSO,
          mustChangePassword: false,
          themePreference: ThemePreference.LIGHT,
          locale: "en",
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(record.id));
      break;
    }

    case "findUserByEmail": {
      const { email } = await readJson<{ email: string }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          authMethod: true,
        },
      });

      process.stdout.write(JSON.stringify(user ?? null));
      break;
    }

    case "updateUserStatus": {
      const { email, status } = await readJson<{
        email: string;
        status: UserStatus;
      }>();
      await prisma.user.update({
        where: { email: normalizeEmail(email) },
        data: { status },
      });

      process.stdout.write("null");
      break;
    }

    case "deactivatePlatformAdminsExcept": {
      const { email } = await readJson<{ email: string }>();
      await prisma.user.updateMany({
        where: {
          email: { not: normalizeEmail(email) },
          role: Role.PLATFORM_ADMIN,
          status: UserStatus.ACTIVE,
        },
        data: { status: UserStatus.INACTIVE },
      });

      process.stdout.write("null");
      break;
    }

    case "assignUserToScope": {
      const { email, scope } = await readJson<{
        email: string;
        scope: { code: string; name: string };
      }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true },
      });

      if (!user) {
        throw new Error(`User not found for assignment: ${email}`);
      }

      const scopeRecord = await prisma.scope.upsert({
        where: { code: scope.code },
        update: {
          name: scope.name,
        },
        create: {
          code: scope.code,
          name: scope.name,
        },
        select: {
          id: true,
        },
      });

      await prisma.userScopeAssignment.upsert({
        where: {
          userId_scopeId: {
            userId: user.id,
            scopeId: scopeRecord.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          scopeId: scopeRecord.id,
        },
      });

      process.stdout.write(JSON.stringify(scopeRecord.id));
      break;
    }

    case "seedRasterScopeHierarchy": {
      const de = await prisma.scope.upsert({
        where: { code: "DE" },
        update: { name: "Germany", parentId: null },
        create: { code: "DE", name: "Germany" },
        select: { id: true },
      });
      const wttv = await prisma.scope.upsert({
        where: { code: "WTTV" },
        update: {
          name: "Westdeutscher Tischtennis-Verband",
          parentId: de.id,
        },
        create: {
          code: "WTTV",
          name: "Westdeutscher Tischtennis-Verband",
          parentId: de.id,
        },
        select: { id: true },
      });
      const districts = await Promise.all(
        wttvDistricts.map(([code, name]) =>
          prisma.scope.upsert({
            where: { code },
            update: { name, parentId: wttv.id },
            create: { code, name, parentId: wttv.id },
            select: { id: true, code: true },
          }),
        ),
      );
      const owl = districts.find((scope) => scope.code === "OWL");
      if (!owl) throw new Error("OWL scope was not seeded");

      process.stdout.write(
        JSON.stringify({ de: de.id, wttv: wttv.id, owl: owl.id }),
      );
      break;
    }

    case "seedRasterSource": {
      const input = await readJson<{
        scopeCode: string;
        sourceType: string;
        sourceRef: string;
        displayName: string;
        season?: string;
        contentHash?: string | null;
        parsedJson?: unknown;
      }>();
      const season = input.season ?? "2026/27";
      const scope = await prisma.scope.findUnique({
        where: { code: input.scopeCode },
        select: { id: true },
      });

      if (!scope) {
        throw new Error(
          `Scope not found for raster source: ${input.scopeCode}`,
        );
      }

      const source = await prisma.rasterSource.upsert({
        where: {
          scopeId_season_sourceType_sourceRef: {
            scopeId: scope.id,
            season,
            sourceType: input.sourceType,
            sourceRef: input.sourceRef,
          },
        },
        update: {
          displayName: input.displayName,
          contentHash: input.contentHash ?? null,
          parsedJson:
            input.parsedJson === undefined
              ? null
              : JSON.stringify(input.parsedJson),
        },
        create: {
          scopeId: scope.id,
          season,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          displayName: input.displayName,
          contentHash: input.contentHash ?? null,
          parsedJson:
            input.parsedJson === undefined
              ? null
              : JSON.stringify(input.parsedJson),
        },
        select: { id: true },
      });

      process.stdout.write(JSON.stringify(source.id));
      break;
    }

    case "seedRasterProjectionFixture": {
      const input = await readJson<{ email: string; suffix: string }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(input.email) },
        select: { id: true },
      });
      if (!user) throw new Error(`User not found: ${input.email}`);

      const scope = await prisma.scope.upsert({
        where: { code: "OWL" },
        update: { name: "Ostwestfalen/Lippe" },
        create: { code: "OWL", name: "Ostwestfalen/Lippe" },
        select: { id: true },
      });
      const inputSet = await prisma.rasterInputSet.create({
        data: {
          name: `E2E projection ${input.suffix}`,
          scopeId: scope.id,
          season: "2026/27",
          createdById: user.id,
        },
        select: { id: true },
      });
      await prisma.rasterSource.createMany({
        data: [
          {
            scopeId: scope.id,
            season: "2026/27",
            sourceType: "GROUP_ASSIGNMENT",
            sourceRef: `e2e://groups-${input.suffix}`,
            displayName: "E2E groups",
            parsedJson: JSON.stringify({
              assignments: [
                {
                  league: "L",
                  group: "G",
                  division: "Jugend 13",
                  rasterzahl: 1,
                  team: "SC GW Paderborn",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Erwachsene",
                  rasterzahl: 2,
                  team: "SC GW Paderborn",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Erwachsene",
                  rasterzahl: 3,
                  team: "SC GW Paderborn II",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Damen",
                  rasterzahl: 4,
                  team: "TTV Borgholz",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Erwachsene",
                  rasterzahl: 5,
                  team: "Club A",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Erwachsene",
                  rasterzahl: 6,
                  team: "Club B",
                  sourceUrl: "",
                },
                {
                  league: "L",
                  group: "G",
                  division: "Erwachsene",
                  rasterzahl: 7,
                  team: "Club C",
                  sourceUrl: "",
                },
              ],
            }),
          },
          {
            scopeId: scope.id,
            season: "2026/27",
            sourceType: "WISHES_PDF",
            sourceRef: `e2e://wishes-${input.suffix}`,
            displayName: "E2E wishes",
            parsedJson: JSON.stringify({
              clubs: [
                {
                  id: "sc-gw-paderborn-42706",
                  name: "SC GW Paderborn",
                  venues: [{ hall: "1", name: "Halle 1" }],
                  notes: "1. und 2. Mannschaft im Wechsel",
                },
                {
                  id: "ttv-borgholz",
                  name: "TTV Borgholz",
                  venues: [{ hall: "1", name: "Halle 1" }],
                  notes: "",
                },
              ],
              teams: [
                {
                  id: "wish-youth",
                  clubId: "sc-gw-paderborn-42706",
                  label: "Jugend 13",
                  homeWeekday: "sunday",
                  hall: "1",
                  startTime: "10:00",
                  confidence: "ok",
                },
                {
                  id: "wish-adult",
                  clubId: "sc-gw-paderborn-42706",
                  label: "Erwachsene",
                  homeWeekday: "friday",
                  hall: "1",
                  startTime: "19:45",
                  spielwochePref: "A",
                  confidence: "ok",
                },
                {
                  id: "wish-adult-2",
                  clubId: "sc-gw-paderborn-42706",
                  label: "Erwachsene II",
                  homeWeekday: "monday",
                  hall: "1",
                  startTime: "19:45",
                  spielwochePref: "A",
                  confidence: "ok",
                },
                {
                  id: "wish-damen",
                  clubId: "ttv-borgholz",
                  label: "Damen",
                  homeWeekday: "tuesday",
                  hall: "1",
                  startTime: "19:30",
                  confidence: "ok",
                },
              ],
              warnings: [],
            }),
          },
        ],
      });

      const synced = await syncInputSetSourceCaches(inputSet.id);
      const model = JSON.parse(synced?.seasonModelJson ?? "{}") as {
        teams?: Array<Record<string, unknown>>;
        wishes?: unknown[];
      };
      const keys = new Set(
        (model.teams ?? []).map((team) => `${team.clubId}|${team.label}`),
      );
      const youth = (model.teams ?? []).find(
        (team) =>
          team.clubId === "sc-gw-paderborn" && team.label === "Jugend 13",
      );
      const adult = (model.teams ?? []).find(
        (team) =>
          team.clubId === "sc-gw-paderborn" && team.label === "Erwachsene II",
      );
      const defaultOnly = (model.teams ?? []).filter(
        (team) => team.capacityRelevant === false,
      );
      process.stdout.write(
        JSON.stringify({
          inputSetId: inputSet.id,
          teamCount: model.teams?.length ?? 0,
          uniqueClubLabelKeys: keys.size,
          youthStartTime: youth?.startTime,
          adultWeekday: adult?.homeWeekday,
          defaultOnlyCount: defaultOnly.length,
          relationalWishes: model.wishes?.length ?? 0,
        }),
      );
      break;
    }

    case "seedRasterCombinedReviewFixture": {
      const input = await readJson<{ email: string; suffix: string }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(input.email) },
        select: { id: true },
      });
      if (!user) throw new Error(`User not found: ${input.email}`);

      const [owl, westfalen] = await Promise.all([
        prisma.scope.findUnique({
          where: { code: "OWL" },
          select: { id: true },
        }),
        prisma.scope.findUnique({
          where: { code: "WESTFALEN_MITTE" },
          select: { id: true },
        }),
      ]);
      if (!owl || !westfalen) {
        throw new Error("Raster scope hierarchy must be seeded first");
      }

      const result = await prisma.$transaction(async (tx) => {
        const singleInputSet = await tx.rasterInputSet.create({
          data: {
            name: `E2E single review ${input.suffix}`,
            scopeId: owl.id,
            season: "2026/27",
            createdById: user.id,
            status: InputSetStatus.READY,
            seasonModelJson: "{}",
          },
          select: { id: true },
        });
        const singleRun = await tx.rasterOptimizationRun.create({
          data: {
            inputSetId: singleInputSet.id,
            startedById: user.id,
            status: OptimizationRunStatus.SUCCEEDED,
            outcome: OptimizationRunOutcome.PROVEN_OPTIMAL,
            settings: JSON.stringify({ strategy: "cp_sat", name: "Single" }),
            coverageComplete: true,
            coverageJson: JSON.stringify({
              complete: true,
              spannedScopes: [owl.id],
              spannedAll: true,
              excludedGroups: [],
              wishGaps: [],
              capacityGaps: [],
            }),
          },
          select: { id: true },
        });
        const singleSnapshot = await createSnapshot(tx, {
          runId: singleRun.id,
          scopeId: owl.id,
          assignments: [assignment(owl.id, "OWL Club", "OWL I", "single-owl")],
        });

        const combinedInputSet = await tx.rasterInputSet.create({
          data: {
            name: `E2E combined review ${input.suffix}`,
            scopeId: owl.id,
            season: "2026/27",
            createdById: user.id,
            status: InputSetStatus.READY,
            seasonModelJson: "{}",
            spannedScopes: {
              create: [{ scopeId: owl.id }, { scopeId: westfalen.id }],
            },
          },
          select: { id: true },
        });
        const incompleteRun = await tx.rasterOptimizationRun.create({
          data: {
            inputSetId: combinedInputSet.id,
            startedById: user.id,
            status: OptimizationRunStatus.SUCCEEDED,
            outcome: OptimizationRunOutcome.PROVEN_OPTIMAL,
            settings: JSON.stringify({
              strategy: "cp_sat",
              name: "Incomplete combined",
            }),
            coverageComplete: false,
            coverageJson: JSON.stringify({
              complete: false,
              spannedScopes: [owl.id, westfalen.id],
              spannedAll: false,
              excludedGroups: ["Liga::Gruppe 1"],
              wishGaps: [],
              capacityGaps: [],
            }),
          },
          select: { id: true },
        });
        const combinedSnapshot = await createSnapshot(tx, {
          runId: incompleteRun.id,
          scopeId: owl.id,
          spannedScopeIds: [owl.id, westfalen.id],
          assignments: [
            assignment(owl.id, "OWL Club", "OWL I", "combined-owl"),
            assignment(
              westfalen.id,
              "Westfalen Club",
              "Westfalen I",
              "combined-westfalen",
            ),
          ],
        });

        const completeRun = await tx.rasterOptimizationRun.create({
          data: {
            inputSetId: combinedInputSet.id,
            startedById: user.id,
            status: OptimizationRunStatus.SUCCEEDED,
            outcome: OptimizationRunOutcome.PROVEN_OPTIMAL,
            settings: JSON.stringify({
              strategy: "cp_sat",
              name: "Complete combined",
            }),
            coverageComplete: true,
            coverageJson: JSON.stringify({
              complete: true,
              spannedScopes: [owl.id, westfalen.id],
              spannedAll: true,
              excludedGroups: [],
              wishGaps: [],
              capacityGaps: [],
            }),
          },
          select: { id: true },
        });
        const completeCombinedSnapshot = await createSnapshot(tx, {
          runId: completeRun.id,
          scopeId: owl.id,
          spannedScopeIds: [owl.id, westfalen.id],
          assignments: [
            assignment(owl.id, "Complete OWL Club", "OWL II", "complete-owl"),
          ],
        });

        return {
          combinedSnapshotId: combinedSnapshot.id,
          completeCombinedSnapshotId: completeCombinedSnapshot.id,
          singleSnapshotId: singleSnapshot.id,
          owlScopeId: owl.id,
          westfalenScopeId: westfalen.id,
        };
      });

      process.stdout.write(JSON.stringify(result));
      break;
    }

    case "addAuditEntryFixture": {
      const input = await readJson<{
        actorEmail: string;
        action: AuditAction;
        entityType: string;
        entityId: string;
        scopeId?: string | null;
        details?: unknown;
      }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(input.actorEmail) },
        select: { id: true },
      });

      if (!user) {
        throw new Error(
          `User not found for audit fixture: ${input.actorEmail}`,
        );
      }

      const entry = await prisma.auditEntry.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          actorId: user.id,
          scopeId: input.scopeId ?? null,
          details: JSON.stringify(input.details ?? {}),
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(entry.id));
      break;
    }

    case "seedBackgroundJob": {
      const input = await readJson<{
        jobType: string;
        status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
        payload?: unknown;
        result?: unknown;
        error?: string | null;
        createdByEmail?: string;
        workerId?: string | null;
        attemptCount?: number;
      }>();

      const normalizedEmail = input.createdByEmail
        ? normalizeEmail(input.createdByEmail)
        : null;
      const user = normalizedEmail
        ? await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null;

      const job = await prisma.backgroundJob.create({
        data: {
          jobType: input.jobType,
          status: input.status ?? "PENDING",
          payload: JSON.stringify(input.payload ?? {}),
          result:
            input.result === undefined ? null : JSON.stringify(input.result),
          error: input.error ?? null,
          createdByUserId: user?.id ?? null,
          workerId: input.workerId ?? null,
          attemptCount: input.attemptCount ?? 0,
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(job.id));
      break;
    }

    case "seedNotificationTypeConfiguration": {
      const input = await readJson<{
        eventType: NotificationEventType;
        enabled: boolean;
        updatedByEmail?: string;
      }>();

      const normalizedEmail = input.updatedByEmail
        ? normalizeEmail(input.updatedByEmail)
        : null;
      const user = normalizedEmail
        ? await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null;

      const config = await (
        prisma as unknown as {
          notificationTypeConfiguration: {
            upsert(args: {
              where: { eventType: NotificationEventType };
              update: { enabled: boolean; updatedByUserId: string | null };
              create: {
                eventType: NotificationEventType;
                enabled: boolean;
                updatedByUserId: string | null;
              };
            }): Promise<{ eventType: NotificationEventType }>;
          };
        }
      ).notificationTypeConfiguration.upsert({
        where: {
          eventType: input.eventType,
        },
        update: {
          enabled: input.enabled,
          updatedByUserId: user?.id ?? null,
        },
        create: {
          eventType: input.eventType,
          enabled: input.enabled,
          updatedByUserId: user?.id ?? null,
        },
      });

      process.stdout.write(JSON.stringify(config.eventType));
      break;
    }

    case "seedNotificationFixture": {
      const input = await readJson<{
        eventType: NotificationEventType;
        actorEmail?: string;
        affectedUserEmail?: string;
        recipientEmail: string;
        recipientUserEmail?: string;
        locale?: string;
        subject: string;
        bodyText?: string;
        bodyHtml?: string | null;
        status?: NotificationStatus;
        retryCount?: number;
        providerMessageId?: string | null;
        lastError?: string | null;
        sentAt?: string | null;
        payload?: unknown;
      }>();

      const [actor, affectedUser, recipientUser] = await Promise.all([
        input.actorEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.actorEmail) },
              select: { id: true },
            })
          : null,
        input.affectedUserEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.affectedUserEmail) },
              select: { id: true },
            })
          : null,
        input.recipientUserEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.recipientUserEmail) },
              select: { id: true },
            })
          : null,
      ]);

      const event = await prisma.notificationEvent.create({
        data: {
          eventType: input.eventType,
          actorId: actor?.id ?? null,
          affectedUserId: affectedUser?.id ?? null,
          payload: JSON.stringify(input.payload ?? {}),
        },
        select: {
          id: true,
        },
      });

      const notification = await prisma.notification.create({
        data: {
          eventId: event.id,
          recipientEmail: normalizeEmail(input.recipientEmail),
          recipientUserId: recipientUser?.id ?? null,
          locale: input.locale ?? "en",
          subject: input.subject,
          bodyText: input.bodyText ?? input.subject,
          bodyHtml: input.bodyHtml ?? null,
          status: input.status ?? NotificationStatus.QUEUED,
          retryCount: input.retryCount ?? 0,
          providerMessageId: input.providerMessageId ?? null,
          lastError: input.lastError ?? null,
          sentAt: input.sentAt ? new Date(input.sentAt) : null,
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(notification.id));
      break;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
