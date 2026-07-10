import { prisma } from "@/lib/db";
import { createGraphTeamsClient } from "@/lib/teams/client";
import { getOrCreateTeamsConfig } from "@/services/teams/admin";

const MAX_INBOUND_CONTENT_BYTES = 64 * 1024;

export async function processTeamsIntakePoll() {
  if (!isTeamsFeatureEnabled()) {
    return { processedSubscriptions: 0, created: 0, duplicates: 0 };
  }

  const config = await getOrCreateTeamsConfig();
  if (!config.intakeEnabled) {
    return { processedSubscriptions: 0, created: 0, duplicates: 0 };
  }

  const subscriptions = await prisma.teamsIntakeSubscription.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
  if (subscriptions.length === 0) {
    return { processedSubscriptions: 0, created: 0, duplicates: 0 };
  }

  const client = createGraphTeamsClient();
  let created = 0;
  let duplicates = 0;

  for (const subscription of subscriptions) {
    const result = await client.getChannelMessagesDelta({
      teamId: subscription.teamId,
      channelId: subscription.channelId,
      deltaToken: subscription.deltaToken,
      top: 50,
    });

    for (const message of result.messages) {
      const exists = await prisma.teamsInboundMessage.findUnique({
        where: { providerMessageId: message.id },
        select: { id: true },
      });
      if (exists) {
        duplicates += 1;
        continue;
      }

      const prepared = truncateUtf8(message.content, MAX_INBOUND_CONTENT_BYTES);
      await prisma.teamsInboundMessage.create({
        data: {
          subscriptionId: subscription.id,
          providerMessageId: message.id,
          teamId: message.teamId,
          channelId: message.channelId,
          senderDisplayName: message.senderDisplayName,
          senderUserId: message.senderUserId,
          content: prepared.content,
          contentType: message.contentType,
          truncated: prepared.truncated,
          messageCreatedAt: message.createdAt
            ? new Date(message.createdAt)
            : new Date(),
        },
      });
      created += 1;
    }

    await prisma.teamsIntakeSubscription.update({
      where: { id: subscription.id },
      data: {
        deltaToken: result.deltaToken,
        lastPolledAt: new Date(),
      },
    });
  }

  return {
    processedSubscriptions: subscriptions.length,
    created,
    duplicates,
  };
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
