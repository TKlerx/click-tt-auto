-- CreateEnum
CREATE TYPE "TeamsMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'RETRYING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "TeamsInboundStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED');

-- CreateTable
CREATE TABLE "TeamsIntegrationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsIntegrationConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamsDeliveryTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "teamName" TEXT,
    "channelName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsDeliveryTarget_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamsOutboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "eventId" TEXT,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'html',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "status" "TeamsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "graphMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsOutboundMessage_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TeamsDeliveryTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamsOutboundMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamsIntakeSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "teamName" TEXT,
    "channelName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deltaToken" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsIntakeSubscription_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamsInboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "senderDisplayName" TEXT,
    "senderUserId" TEXT,
    "content" TEXT,
    "contentType" TEXT,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "processingStatus" "TeamsInboundStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingNotes" TEXT,
    "messageCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsInboundMessage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TeamsIntakeSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeamsDeliveryTarget_active_idx" ON "TeamsDeliveryTarget"("active");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsDeliveryTarget_teamId_channelId_key" ON "TeamsDeliveryTarget"("teamId", "channelId");

-- CreateIndex
CREATE INDEX "TeamsOutboundMessage_targetId_createdAt_idx" ON "TeamsOutboundMessage"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamsOutboundMessage_status_createdAt_idx" ON "TeamsOutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TeamsOutboundMessage_eventType_createdAt_idx" ON "TeamsOutboundMessage"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "TeamsIntakeSubscription_active_idx" ON "TeamsIntakeSubscription"("active");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsIntakeSubscription_teamId_channelId_key" ON "TeamsIntakeSubscription"("teamId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsInboundMessage_providerMessageId_key" ON "TeamsInboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "TeamsInboundMessage_subscriptionId_createdAt_idx" ON "TeamsInboundMessage"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamsInboundMessage_processingStatus_createdAt_idx" ON "TeamsInboundMessage"("processingStatus", "createdAt");

-- CreateIndex
CREATE INDEX "TeamsInboundMessage_channelId_messageCreatedAt_idx" ON "TeamsInboundMessage"("channelId", "messageCreatedAt");
