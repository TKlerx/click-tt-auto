-- SQLite stores Prisma enums as text, so no physical enum schema change is required.
-- This migration introduces inbound mailbox persistence for deduplication and correlation.

CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerMessageId" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "internetMessageId" TEXT,
    "conversationId" TEXT,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "inReplyTo" TEXT,
    "referenceIds" TEXT NOT NULL DEFAULT '[]',
    "receivedAt" DATETIME NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processingNotes" TEXT,
    "correlatedNotificationId" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "InboundEmail_providerMessageId_key" ON "InboundEmail"("providerMessageId");
CREATE INDEX "InboundEmail_processingStatus_receivedAt_idx" ON "InboundEmail"("processingStatus", "receivedAt");
CREATE INDEX "InboundEmail_mailbox_receivedAt_idx" ON "InboundEmail"("mailbox", "receivedAt");
CREATE INDEX "InboundEmail_correlatedNotificationId_receivedAt_idx" ON "InboundEmail"("correlatedNotificationId", "receivedAt");
CREATE INDEX "InboundEmail_linkedEntityType_linkedEntityId_idx" ON "InboundEmail"("linkedEntityType", "linkedEntityId");
