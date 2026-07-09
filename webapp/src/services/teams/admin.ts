import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import {
  TeamsInboundStatus,
  TeamsMessageStatus,
} from "../../../generated/prisma/enums";

const DEFAULT_CONFIG_ID = "default";

export async function getOrCreateTeamsConfig() {
  const existing = await prisma.teamsIntegrationConfig.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.teamsIntegrationConfig.create({
      data: {
        id: DEFAULT_CONFIG_ID,
      },
    });
  } catch (error) {
    if (String(error).includes("Unique constraint failed")) {
      const recovered = await prisma.teamsIntegrationConfig.findUnique({
        where: { id: DEFAULT_CONFIG_ID },
      });
      if (recovered) {
        return recovered;
      }
    }
    throw error;
  }
}

export async function updateTeamsConfig(input: {
  actorId: string;
  sendEnabled?: boolean;
  intakeEnabled?: boolean;
}) {
  const config = await getOrCreateTeamsConfig();
  return prisma.teamsIntegrationConfig.update({
    where: { id: config.id },
    data: {
      sendEnabled: input.sendEnabled ?? config.sendEnabled,
      intakeEnabled: input.intakeEnabled ?? config.intakeEnabled,
      updatedByUserId: input.actorId,
    },
  });
}

export async function listDeliveryTargets() {
  return prisma.teamsDeliveryTarget.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createDeliveryTarget(input: {
  actorId: string;
  name: string;
  teamId: string;
  channelId: string;
  teamName?: string | null;
  channelName?: string | null;
}) {
  return createWithUniqueConstraintGuard(
    () =>
      prisma.teamsDeliveryTarget.create({
        data: {
          name: input.name.trim(),
          teamId: input.teamId.trim(),
          channelId: input.channelId.trim(),
          teamName: input.teamName?.trim() || null,
          channelName: input.channelName?.trim() || null,
          createdByUserId: input.actorId,
        },
      }),
    "Target already exists for this team/channel",
  );
}

export async function updateDeliveryTarget(
  targetId: string,
  input: { name?: string; active?: boolean },
) {
  return prisma.teamsDeliveryTarget.update({
    where: { id: targetId },
    data: {
      ...(typeof input.name === "string" ? { name: input.name.trim() } : {}),
      ...(typeof input.active === "boolean" ? { active: input.active } : {}),
    },
  });
}

export async function deleteDeliveryTarget(targetId: string) {
  const pendingMessages = await prisma.teamsOutboundMessage.count({
    where: {
      targetId,
      status: {
        in: [
          TeamsMessageStatus.QUEUED,
          TeamsMessageStatus.SENDING,
          TeamsMessageStatus.RETRYING,
        ],
      },
    },
  });

  if (pendingMessages > 0) {
    return { error: jsonError("Target has pending outbound messages", 409) };
  }

  const historicalMessages = await prisma.teamsOutboundMessage.count({
    where: { targetId },
  });

  if (historicalMessages > 0) {
    return {
      error: jsonError(
        "Target has outbound message history and cannot be deleted. Set it inactive instead.",
        409,
      ),
    };
  }

  try {
    await prisma.teamsDeliveryTarget.delete({
      where: { id: targetId },
    });
  } catch (error) {
    if (
      String(error).includes("P2003") ||
      String(error).includes("Foreign key constraint")
    ) {
      return {
        error: jsonError(
          "Target has outbound message history and cannot be deleted. Set it inactive instead.",
          409,
        ),
      };
    }
    throw error;
  }
  return { deleted: true };
}

export async function listIntakeSubscriptions() {
  return prisma.teamsIntakeSubscription.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createIntakeSubscription(input: {
  actorId: string;
  teamId: string;
  channelId: string;
  teamName?: string | null;
  channelName?: string | null;
}) {
  return createWithUniqueConstraintGuard(
    () =>
      prisma.teamsIntakeSubscription.create({
        data: {
          teamId: input.teamId.trim(),
          channelId: input.channelId.trim(),
          teamName: input.teamName?.trim() || null,
          channelName: input.channelName?.trim() || null,
          createdByUserId: input.actorId,
        },
      }),
    "Subscription already exists for this team/channel",
  );
}

export async function updateIntakeSubscription(
  subscriptionId: string,
  input: { active?: boolean },
) {
  return prisma.teamsIntakeSubscription.update({
    where: { id: subscriptionId },
    data: typeof input.active === "boolean" ? { active: input.active } : {},
  });
}

export async function deleteIntakeSubscription(subscriptionId: string) {
  try {
    await prisma.teamsIntakeSubscription.delete({
      where: { id: subscriptionId },
    });
  } catch (error) {
    if (
      String(error).includes("P2003") ||
      String(error).includes("Foreign key constraint")
    ) {
      return {
        error: jsonError(
          "Subscription has inbound message history and cannot be deleted. Set it inactive instead.",
          409,
        ),
      };
    }
    throw error;
  }

  return { deleted: true };
}

export async function getIntegrationStatus() {
  const [
    config,
    lastSend,
    lastIntake,
    recentSendFailures,
    recentIntakeFailures,
    recentOutbound,
    recentInbound,
  ] = await Promise.all([
    getOrCreateTeamsConfig(),
    prisma.teamsOutboundMessage.findFirst({
      where: { status: TeamsMessageStatus.SENT },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.teamsInboundMessage.findFirst({
      where: { processingStatus: { not: TeamsInboundStatus.IGNORED } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.teamsOutboundMessage.count({
      where: {
        status: TeamsMessageStatus.FAILED,
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.teamsInboundMessage.count({
      where: {
        processingStatus: TeamsInboundStatus.IGNORED,
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.teamsOutboundMessage.findMany({
      include: { target: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.teamsInboundMessage.findMany({
      include: { subscription: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const recentActivity = [
    ...recentOutbound.map((item) => ({
      type: "send" as const,
      targetName: item.target.name,
      eventType: item.eventType,
      status: item.status,
      timestamp: item.updatedAt,
      error: item.lastError,
    })),
    ...recentInbound.map((item) => ({
      type: "intake" as const,
      subscriptionName: `${item.subscription.teamName ?? item.teamId} / ${item.subscription.channelName ?? item.channelId}`,
      messagesIngested: 1,
      timestamp: item.updatedAt,
      error:
        item.processingStatus === TeamsInboundStatus.IGNORED
          ? item.processingNotes
          : null,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20);

  return {
    sendEnabled: config.sendEnabled,
    intakeEnabled: config.intakeEnabled,
    updatedAt: config.updatedAt,
    health: {
      lastSuccessfulSend: lastSend?.updatedAt ?? null,
      lastSuccessfulIntake: lastIntake?.updatedAt ?? null,
      recentSendFailures,
      recentIntakeFailures,
    },
    recentActivity,
  };
}

async function createWithUniqueConstraintGuard<T>(
  operation: () => Promise<T>,
  conflictMessage: string,
) {
  try {
    return await operation();
  } catch (error) {
    if (String(error).includes("Unique constraint failed")) {
      return { error: jsonError(conflictMessage, 409) };
    }
    throw error;
  }
}
