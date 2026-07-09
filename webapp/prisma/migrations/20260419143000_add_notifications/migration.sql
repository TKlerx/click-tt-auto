-- SQLite stores Prisma enums as text, so no physical enum schema change is required.
-- This migration introduces the NotificationEvent and Notification tables used
-- for durable outbound email tracking.

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "affectedUserId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_createdAt_idx" ON "NotificationEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_actorId_createdAt_idx" ON "NotificationEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_affectedUserId_createdAt_idx" ON "NotificationEvent"("affectedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_eventId_idx" ON "Notification"("eventId");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientEmail_status_idx" ON "Notification"("recipientEmail", "status");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_createdAt_idx" ON "Notification"("recipientUserId", "createdAt");
