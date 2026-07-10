"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";
import { useToast } from "@/components/ui/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";

type NotificationConfig = {
  eventType: string;
  enabled: boolean;
  updatedByUserId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type NotificationLogRow = {
  id: string;
  eventId: string;
  eventType: string;
  recipientEmail: string;
  locale: string;
  subject: string;
  status: string;
  retryCount: number;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const ALL_FILTER = "all";

export function NotificationAdminPanel({
  initialConfigs,
  initialNotifications,
}: {
  initialConfigs: NotificationConfig[];
  initialNotifications: NotificationLogRow[];
}) {
  const t = useTranslations("notifications");
  const { pushToast } = useToast();
  const [configs, setConfigs] = useState(initialConfigs);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [eventTypeFilter, setEventTypeFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [loading, setLoading] = useState(false);
  const [busyEventType, setBusyEventType] = useState<string | null>(null);

  async function refreshNotifications(
    nextEventType = eventTypeFilter,
    nextStatus = statusFilter,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextEventType !== ALL_FILTER) {
        params.set("eventType", nextEventType);
      }
      if (nextStatus !== ALL_FILTER) {
        params.set("status", nextStatus);
      }

      const suffix = params.toString();
      const response = await fetch(
        withBasePath(`/api/notifications${suffix ? `?${suffix}` : ""}`),
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        notifications?: NotificationLogRow[];
      } | null;

      if (!response.ok || !payload?.notifications) {
        pushToast(payload?.error ?? t("loadFailed"));
        return;
      }

      setNotifications(payload.notifications);
    } finally {
      setLoading(false);
    }
  }

  async function toggleConfig(config: NotificationConfig, enabled: boolean) {
    setBusyEventType(config.eventType);
    try {
      const response = await fetch(
        withBasePath(
          `/api/notifications/settings/${encodeURIComponent(config.eventType)}`,
        ),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        config?: NotificationConfig;
      } | null;

      if (!response.ok || !payload?.config) {
        pushToast(payload?.error ?? t("saveFailed"));
        return;
      }

      setConfigs((current) =>
        current.map((item) =>
          item.eventType === payload.config!.eventType ? payload.config! : item,
        ),
      );
      pushToast(enabled ? t("enabledSaved") : t("disabledSaved"));
    } finally {
      setBusyEventType(null);
    }
  }

  const summary = {
    queued: notifications.filter(
      (item) => item.status === "QUEUED" || item.status === "RETRYING",
    ).length,
    sent: notifications.filter((item) => item.status === "SENT").length,
    failed: notifications.filter(
      (item) => item.status === "FAILED" || item.status === "BOUNCED",
    ).length,
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t("settingsTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {t("settingsDescription")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configs.map((config) => (
            <article
              key={config.eventType}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {t(`eventTypes.${config.eventType}`)}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
                    {config.eventType}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={config.enabled}
                    className="size-4 rounded"
                    disabled={busyEventType === config.eventType}
                    onChange={(event) =>
                      void toggleConfig(config, event.target.checked)
                    }
                    type="checkbox"
                  />
                  {config.enabled ? t("enabled") : t("disabled")}
                </label>
              </div>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                {t("updatedAt", { value: formatDate(config.updatedAt) })}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t("logTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {t("logDescription")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              onValueChange={(value) => {
                setEventTypeFilter(value);
                void refreshNotifications(value, statusFilter);
              }}
              value={eventTypeFilter}
            >
              <SelectTrigger className="w-[18rem] rounded-lg border-[var(--border)] bg-white px-3 py-2 shadow-none dark:bg-[var(--panel)]">
                <SelectValue placeholder={t("eventFilter")} />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-[var(--border)]">
                <SelectItem value={ALL_FILTER}>{t("allEvents")}</SelectItem>
                {configs.map((config) => (
                  <SelectItem key={config.eventType} value={config.eventType}>
                    {t(`eventTypes.${config.eventType}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) => {
                setStatusFilter(value);
                void refreshNotifications(eventTypeFilter, value);
              }}
              value={statusFilter}
            >
              <SelectTrigger className="w-[18rem] rounded-lg border-[var(--border)] bg-white px-3 py-2 shadow-none dark:bg-[var(--panel)]">
                <SelectValue placeholder={t("statusFilter")} />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-[var(--border)]">
                <SelectItem value={ALL_FILTER}>{t("allStatuses")}</SelectItem>
                {["QUEUED", "RETRYING", "SENT", "FAILED", "BOUNCED"].map(
                  (status) => (
                    <SelectItem key={status} value={status}>
                      {t(`statuses.${status}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label={t("summaryQueued")} value={summary.queued} />
          <SummaryCard label={t("summarySent")} value={summary.sent} />
          <SummaryCard label={t("summaryFailed")} value={summary.failed} />
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("createdAtLabel")}</TableHead>
                  <TableHead>{t("eventLabel")}</TableHead>
                  <TableHead>{t("recipientLabel")}</TableHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                  <TableHead>{t("subjectLabel")}</TableHead>
                  <TableHead>{t("detailsLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>{formatDate(notification.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {t(`eventTypes.${notification.eventType}`)}
                      </div>
                      <div className="font-mono text-xs text-[var(--muted-foreground)]">
                        {notification.eventType}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{notification.recipientEmail}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {t("localeValue", { locale: notification.locale })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">
                        {t(`statuses.${notification.status}`)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate">
                      {notification.subject}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {notification.sentAt
                          ? t("sentAtValue", {
                              value: formatDate(notification.sentAt),
                            })
                          : t("notSentYet")}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {t("retryCountValue", {
                          count: notification.retryCount,
                        })}
                      </div>
                      {notification.lastError ? (
                        <div className="mt-1 max-w-[18rem] text-xs text-rose-700 dark:text-rose-300">
                          {notification.lastError}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("loading")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-semibold">{value}</p>
    </article>
  );
}

function formatDate(value: string | Date | null) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
