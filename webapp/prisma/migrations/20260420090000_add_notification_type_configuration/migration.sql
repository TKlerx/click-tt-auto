-- SQLite stores Prisma enums as text, so no physical enum schema change is required.
-- This migration introduces durable notification type configuration records.

CREATE TABLE "NotificationTypeConfiguration" (
    "eventType" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
