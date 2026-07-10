import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NotificationEventType } from "../../../generated/prisma/enums";
import { createGraphTeamsClient } from "@/lib/teams/client";
import { getOrCreateTeamsConfig } from "@/services/teams/admin";

const MAX_TEAMS_CONTENT_BYTES = 28 * 1024;
const DELIVERY_JOB_TYPE = "teams_message_delivery";
const teamsLogger = logger.child({ component: "teams" });

type QueueTeamsInput = {
  actorId: string;
  eventType: NotificationEventType;
  eventId?: string | null;
  payload: Record<string, unknown>;
};

export async function safeQueueTeamsMessages(input: QueueTeamsInput) {
  try {
    await queueTeamsMessages(input);
  } catch (error) {
    teamsLogger.error("teams.queue_failed", {
      error,
      actorId: input.actorId,
      eventType: input.eventType,
      eventId: input.eventId ?? null,
    });
  }
}

export async function queueTeamsMessages(input: QueueTeamsInput) {
  if (!isTeamsFeatureEnabled()) {
    return;
  }

  const config = await getOrCreateTeamsConfig();
  if (!config.sendEnabled) {
    return;
  }

  const targets = await prisma.teamsDeliveryTarget.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length === 0) {
    return;
  }

  const content = buildTeamsContent(input.eventType, input.payload);
  const prepared = truncateUtf8(content, MAX_TEAMS_CONTENT_BYTES);
  await prisma.$transaction(async (tx) => {
    for (const target of targets) {
      const outbound = await tx.teamsOutboundMessage.create({
        data: {
          targetId: target.id,
          eventType: input.eventType,
          eventId: input.eventId ?? null,
          content: prepared.content,
          contentType: "html",
          truncated: prepared.truncated,
        },
      });

      await tx.backgroundJob.create({
        data: {
          jobType: DELIVERY_JOB_TYPE,
          payload: JSON.stringify({
            teamsOutboundMessageId: outbound.id,
            targetId: target.id,
            teamId: target.teamId,
            channelId: target.channelId,
            content: outbound.content,
            contentType: outbound.contentType,
          }),
          createdByUserId: input.actorId,
        },
      });
    }
  });
}

export async function deliverTeamsMessage(payload: {
  teamsOutboundMessageId: string;
  teamId: string;
  channelId: string;
  content: string;
  contentType?: "text" | "html";
}) {
  const teamsClient = createGraphTeamsClient();

  const outbound = await prisma.teamsOutboundMessage.update({
    where: { id: payload.teamsOutboundMessageId },
    data: {
      status: "SENDING",
      attemptCount: {
        increment: 1,
      },
    },
  });

  const response = await teamsClient.sendChannelMessage({
    teamId: payload.teamId,
    channelId: payload.channelId,
    content: payload.content,
    contentType: payload.contentType ?? "html",
  });

  await prisma.teamsOutboundMessage.update({
    where: { id: outbound.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      graphMessageId: response.messageId,
      lastError: null,
    },
  });
}

function buildTeamsContent(
  eventType: NotificationEventType,
  payload: Record<string, unknown>,
) {
  const lines = [`<strong>${eventType}</strong>`];
  for (const [key, value] of Object.entries(payload)) {
    lines.push(
      `<div><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value ?? ""))}</div>`,
    );
  }

  return lines.join("");
}

function escapeHtml(value: string) {
  const htmlEntityMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => htmlEntityMap[char] ?? char);
}

function truncateUtf8(value: string, maxBytes: number) {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) {
    return { content: value, truncated: false };
  }

  const marker = "...";
  let candidate = value;
  while (candidate.length > 0) {
    candidate = candidate.slice(0, -1);
    if (new TextEncoder().encode(candidate + marker).byteLength <= maxBytes) {
      return { content: `${candidate}${marker}`, truncated: true };
    }
  }

  return { content: marker, truncated: true };
}

function isTeamsFeatureEnabled() {
  const value = (process.env.TEAMS_ENABLED ?? "false").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
