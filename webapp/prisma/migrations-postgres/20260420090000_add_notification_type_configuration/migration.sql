CREATE TABLE "NotificationTypeConfiguration" (
    "eventType" "NotificationEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTypeConfiguration_pkey" PRIMARY KEY ("eventType")
);
