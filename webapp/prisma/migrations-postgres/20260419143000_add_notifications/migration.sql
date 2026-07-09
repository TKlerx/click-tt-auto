DO $$
BEGIN
  CREATE TYPE "NotificationEventType" AS ENUM (
    'USER_CREATED',
    'ROLE_CHANGED',
    'USER_STATUS_CHANGED',
    'SCOPE_ASSIGNMENT_CHANGED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM (
    'QUEUED',
    'SENDING',
    'RETRYING',
    'SENT',
    'FAILED',
    'BOUNCED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "actorId" TEXT,
    "affectedUserId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationEvent_eventType_createdAt_idx" ON "NotificationEvent"("eventType", "createdAt");
CREATE INDEX "NotificationEvent_actorId_createdAt_idx" ON "NotificationEvent"("actorId", "createdAt");
CREATE INDEX "NotificationEvent_affectedUserId_createdAt_idx" ON "NotificationEvent"("affectedUserId", "createdAt");
CREATE INDEX "Notification_eventId_idx" ON "Notification"("eventId");
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "Notification_recipientEmail_status_idx" ON "Notification"("recipientEmail", "status");
CREATE INDEX "Notification_recipientUserId_createdAt_idx" ON "Notification"("recipientUserId", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
