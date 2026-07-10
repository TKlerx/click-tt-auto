DO $$
BEGIN
  CREATE TYPE "InboundEmailStatus" AS ENUM (
    'RECEIVED',
    'PROCESSED',
    'IGNORED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
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
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processingStatus" "InboundEmailStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingNotes" TEXT,
    "correlatedNotificationId" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmail_providerMessageId_key" ON "InboundEmail"("providerMessageId");
CREATE INDEX "InboundEmail_processingStatus_receivedAt_idx" ON "InboundEmail"("processingStatus", "receivedAt");
CREATE INDEX "InboundEmail_mailbox_receivedAt_idx" ON "InboundEmail"("mailbox", "receivedAt");
CREATE INDEX "InboundEmail_correlatedNotificationId_receivedAt_idx" ON "InboundEmail"("correlatedNotificationId", "receivedAt");
CREATE INDEX "InboundEmail_linkedEntityType_linkedEntityId_idx" ON "InboundEmail"("linkedEntityType", "linkedEntityId");
