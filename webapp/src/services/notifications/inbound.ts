import { prisma } from "@/lib/db";
import {
  InboundEmailStatus,
  NotificationStatus,
} from "../../../generated/prisma/enums";

const NOTIFICATION_REFERENCE_PATTERN = /\[notification:([a-z0-9_-]+)\]/i;
const ENTITY_REFERENCE_PATTERN = /\[ref:([a-z0-9_.-]+):([^\]\s]+)\]/i;
const BOUNCE_SUBJECT_PATTERN =
  /(undeliverable|delivery (?:has )?failed|delivery status notification|failure notice|returned mail)/i;
const BOUNCE_SENDER_PATTERN = /(mailer-daemon|postmaster)/i;

type ReferenceSource = {
  subject?: string | null;
  bodyPreview?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  inReplyTo?: string | null;
  referenceIds?: string[] | null;
  senderEmail?: string | null;
};

type InboundRecordLike = {
  id: string;
  providerMessageId?: string | null;
  subject: string;
  bodyPreview: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  inReplyTo: string | null;
  referenceIds: string;
  senderEmail: string | null;
};

export function appendNotificationReferenceText(
  bodyText: string,
  notificationId: string,
) {
  const normalizedBody = bodyText.trim();
  const reference = `Notification reference: [notification:${notificationId}]`;
  return normalizedBody ? `${normalizedBody}\n\n${reference}` : reference;
}

export function appendNotificationReferenceHtml(
  bodyHtml: string | null | undefined,
  notificationId: string,
) {
  const reference = `Notification reference: [notification:${notificationId}]`;
  if (!bodyHtml?.trim()) {
    return "";
  }

  return `${bodyHtml}\n<p>${reference}</p>`;
}

export function extractNotificationReference(source: ReferenceSource) {
  for (const candidate of collectReferenceCandidates(source)) {
    const match = candidate.match(NOTIFICATION_REFERENCE_PATTERN);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function extractEntityReference(source: ReferenceSource) {
  for (const candidate of collectReferenceCandidates(source)) {
    const match = candidate.match(ENTITY_REFERENCE_PATTERN);
    if (match?.[1] && match?.[2]) {
      return {
        entityType: match[1],
        entityId: match[2],
      };
    }
  }

  return null;
}

export function detectBounceLikeMessage(
  source: Pick<ReferenceSource, "senderEmail" | "subject">,
) {
  return (
    BOUNCE_SENDER_PATTERN.test(source.senderEmail ?? "") ||
    BOUNCE_SUBJECT_PATTERN.test(source.subject ?? "")
  );
}

export async function processInboundEmailById(inboundEmailId: string) {
  const inbound = await prisma.inboundEmail.findUnique({
    where: { id: inboundEmailId },
  });

  if (!inbound) {
    throw new Error(`Inbound email not found: ${inboundEmailId}`);
  }

  return processInboundEmailRecord(inbound);
}

export async function processInboundEmailRecord(inbound: InboundRecordLike) {
  const referenceIds = safeParseReferenceIds(inbound.referenceIds);
  const notificationId = extractNotificationReference({
    subject: inbound.subject,
    bodyPreview: inbound.bodyPreview,
    bodyText: inbound.bodyText,
    bodyHtml: inbound.bodyHtml,
    inReplyTo: inbound.inReplyTo,
    referenceIds,
    senderEmail: inbound.senderEmail,
  });
  const entityReference = extractEntityReference({
    subject: inbound.subject,
    bodyPreview: inbound.bodyPreview,
    bodyText: inbound.bodyText,
    bodyHtml: inbound.bodyHtml,
    inReplyTo: inbound.inReplyTo,
    referenceIds,
  });
  const isBounce = detectBounceLikeMessage({
    senderEmail: inbound.senderEmail,
    subject: inbound.subject,
  });
  const providerCorrelationCandidates = [
    inbound.inReplyTo,
    ...referenceIds,
  ].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value.trim()] : [],
  );

  if (isBounce) {
    const messageIdCandidates = getProviderMessageIdCandidates(
      providerCorrelationCandidates,
    );
    const notification = messageIdCandidates.length
      ? await prisma.notification.findFirst({
          where: {
            providerMessageId: {
              in: messageIdCandidates,
            },
          },
          select: {
            id: true,
            providerMessageId: true,
          },
        })
      : null;

    if (!notification?.providerMessageId) {
      await prisma.inboundEmail.update({
        where: { id: inbound.id },
        data: {
          processingStatus: InboundEmailStatus.IGNORED,
          processingNotes:
            "Bounce-like message lacked verified provider-message correlation.",
        },
      });

      return {
        processingStatus: InboundEmailStatus.IGNORED,
        correlatedNotificationId: null,
        linkedEntityType: null,
        linkedEntityId: null,
      };
    }

    if (notificationId && notification.id !== notificationId) {
      await prisma.inboundEmail.update({
        where: { id: inbound.id },
        data: {
          processingStatus: InboundEmailStatus.IGNORED,
          processingNotes:
            "Bounce-like message content disagreed with provider-message correlation.",
        },
      });

      return {
        processingStatus: InboundEmailStatus.IGNORED,
        correlatedNotificationId: null,
        linkedEntityType: null,
        linkedEntityId: null,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.BOUNCED,
          lastError: `Bounce/NDR received for inbound email ${inbound.id}`,
        },
      });

      await tx.inboundEmail.update({
        where: { id: inbound.id },
        data: {
          processingStatus: InboundEmailStatus.PROCESSED,
          processingNotes:
            "Bounce correlated to notification delivery reference.",
          correlatedNotificationId: notification.id,
        },
      });
    });

    return {
      processingStatus: InboundEmailStatus.PROCESSED,
      correlatedNotificationId: notification.id,
      linkedEntityType: null,
      linkedEntityId: null,
    };
  }

  if (entityReference) {
    await prisma.inboundEmail.update({
      where: { id: inbound.id },
      data: {
        processingStatus: InboundEmailStatus.PROCESSED,
        processingNotes: "Entity reference marker detected.",
        linkedEntityType: entityReference.entityType,
        linkedEntityId: entityReference.entityId,
      },
    });

    return {
      processingStatus: InboundEmailStatus.PROCESSED,
      correlatedNotificationId: null,
      linkedEntityType: entityReference.entityType,
      linkedEntityId: entityReference.entityId,
    };
  }

  await prisma.inboundEmail.update({
    where: { id: inbound.id },
    data: {
      processingStatus: InboundEmailStatus.IGNORED,
      processingNotes: isBounce
        ? "Bounce-like message received without a notification reference."
        : "No notification or entity reference markers detected.",
    },
  });

  return {
    processingStatus: InboundEmailStatus.IGNORED,
    correlatedNotificationId: null,
    linkedEntityType: null,
    linkedEntityId: null,
  };
}

function normalizeMessageId(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function getProviderMessageIdCandidates(values: string[]) {
  const candidates = new Set<string>();
  for (const value of values) {
    const normalized = normalizeMessageId(value);
    if (!normalized) {
      continue;
    }

    candidates.add(normalized);
    candidates.add(`<${normalized}>`);
  }

  return [...candidates];
}

function collectReferenceCandidates(source: ReferenceSource) {
  return [
    source.subject,
    source.bodyPreview,
    source.bodyText,
    source.bodyHtml,
    source.inReplyTo,
    ...(source.referenceIds ?? []),
  ].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value] : [],
  );
}

function safeParseReferenceIds(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
