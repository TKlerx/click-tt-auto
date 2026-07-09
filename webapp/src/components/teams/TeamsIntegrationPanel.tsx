"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type TeamsConfigResponse = {
  sendEnabled: boolean;
  intakeEnabled: boolean;
  updatedAt: string | Date;
  health: {
    lastSuccessfulSend: string | Date | null;
    lastSuccessfulIntake: string | Date | null;
    recentSendFailures: number;
    recentIntakeFailures: number;
  };
  recentActivity: Array<Record<string, unknown>>;
};

type TeamsDeliveryTarget = {
  id: string;
  name: string;
  teamId: string;
  channelId: string;
  teamName: string | null;
  channelName: string | null;
  active: boolean;
  createdAt: string | Date;
};

type TeamsIntakeSubscription = {
  id: string;
  teamId: string;
  channelId: string;
  teamName: string | null;
  channelName: string | null;
  active: boolean;
  lastPolledAt: string | Date | null;
  createdAt: string | Date;
};

type TeamsConsentStatus = {
  connected: boolean;
  scope: string | null;
  expiresAt: string | Date | null;
  updatedAt: string | Date | null;
};

export function TeamsIntegrationPanel({
  initialConfig,
  initialTargets,
  initialSubscriptions,
  initialConsentStatus,
}: {
  initialConfig: TeamsConfigResponse;
  initialTargets: TeamsDeliveryTarget[];
  initialSubscriptions: TeamsIntakeSubscription[];
  initialConsentStatus: TeamsConsentStatus;
}) {
  const t = useTranslations("teams");
  const { pushToast } = useToast();
  const [config, setConfig] = useState(initialConfig);
  const [targets, setTargets] = useState(initialTargets);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [consentStatus, setConsentStatus] = useState(initialConsentStatus);
  const [saving, setSaving] = useState(false);
  const [targetLink, setTargetLink] = useState("");
  const [subscriptionLink, setSubscriptionLink] = useState("");
  const [newTarget, setNewTarget] = useState({
    name: "",
    teamId: "",
    channelId: "",
    teamName: "",
    channelName: "",
  });
  const [newSubscription, setNewSubscription] = useState({
    teamId: "",
    channelId: "",
    teamName: "",
    channelName: "",
  });

  const healthCards = useMemo(
    () => [
      {
        label: t("health.sendFailures"),
        value: config.health.recentSendFailures,
      },
      {
        label: t("health.intakeFailures"),
        value: config.health.recentIntakeFailures,
      },
      {
        label: t("health.lastSend"),
        value: config.health.lastSuccessfulSend
          ? formatDate(config.health.lastSuccessfulSend)
          : "-",
      },
      {
        label: t("health.lastIntake"),
        value: config.health.lastSuccessfulIntake
          ? formatDate(config.health.lastSuccessfulIntake)
          : "-",
      },
    ],
    [config.health, t],
  );
  const sendWarnings = useMemo(() => {
    return config.recentActivity
      .filter(
        (item) =>
          item.type === "send" &&
          item.status === "FAILED" &&
          typeof item.error === "string",
      )
      .map((item) => ({
        targetName: String(item.targetName ?? "-"),
        timestamp: String(item.timestamp ?? ""),
        error: String(item.error),
      }))
      .filter((item) => isArchivedChannelSendError(item.error));
  }, [config.recentActivity]);

  function applyLinkToTarget() {
    const parsed = parseTeamsChannelLink(targetLink);
    if (!parsed) {
      pushToast(t("linkParser.invalid"));
      return;
    }

    setNewTarget((current) => ({
      ...current,
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      channelName: current.channelName || parsed.channelName,
      name: current.name || parsed.channelName || current.name,
    }));
    pushToast(t("linkParser.applied"));
  }

  function applyLinkToSubscription() {
    const parsed = parseTeamsChannelLink(subscriptionLink);
    if (!parsed) {
      pushToast(t("linkParser.invalid"));
      return;
    }

    setNewSubscription((current) => ({
      ...current,
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      channelName: current.channelName || parsed.channelName,
    }));
    pushToast(t("linkParser.applied"));
  }

  async function refresh() {
    const [
      configResponse,
      targetsResponse,
      subscriptionsResponse,
      consentResponse,
    ] = await Promise.all([
      fetch(withBasePath("/api/integrations/teams")),
      fetch(withBasePath("/api/integrations/teams/targets")),
      fetch(withBasePath("/api/integrations/teams/subscriptions")),
      fetch(withBasePath("/api/integrations/teams/consent/status")),
    ]);

    if (configResponse.ok) {
      const payload = (await configResponse.json()) as TeamsConfigResponse;
      setConfig(payload);
    }
    if (targetsResponse.ok) {
      const payload = (await targetsResponse.json()) as {
        targets: TeamsDeliveryTarget[];
      };
      setTargets(payload.targets);
    }
    if (subscriptionsResponse.ok) {
      const payload = (await subscriptionsResponse.json()) as {
        subscriptions: TeamsIntakeSubscription[];
      };
      setSubscriptions(payload.subscriptions);
    }
    if (consentResponse.ok) {
      const payload = (await consentResponse.json()) as TeamsConsentStatus;
      setConsentStatus(payload);
    }
  }

  async function saveConfig(
    next: Partial<Pick<TeamsConfigResponse, "sendEnabled" | "intakeEnabled">>,
  ) {
    setSaving(true);
    try {
      const response = await fetch(withBasePath("/api/integrations/teams"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (!response.ok) {
        pushToast(t("messages.saveFailed"));
        return;
      }

      const payload = (await response.json()) as TeamsConfigResponse;
      setConfig(payload);
      pushToast(t("messages.saved"));
    } finally {
      setSaving(false);
    }
  }

  async function addTarget() {
    const response = await fetch(
      withBasePath("/api/integrations/teams/targets"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTarget),
      },
    );

    if (!response.ok) {
      pushToast(t("messages.targetCreateFailed"));
      return;
    }

    setNewTarget({
      name: "",
      teamId: "",
      channelId: "",
      teamName: "",
      channelName: "",
    });
    await refresh();
    pushToast(t("messages.targetCreated"));
  }

  async function toggleTarget(targetId: string, active: boolean) {
    const response = await fetch(
      withBasePath(
        `/api/integrations/teams/targets/${encodeURIComponent(targetId)}`,
      ),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      },
    );
    if (!response.ok) {
      pushToast(t("messages.targetUpdateFailed"));
      return;
    }
    await refresh();
  }

  async function removeTarget(targetId: string) {
    const response = await fetch(
      withBasePath(
        `/api/integrations/teams/targets/${encodeURIComponent(targetId)}`,
      ),
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      pushToast(t("messages.targetDeleteFailed"));
      return;
    }
    await refresh();
  }

  async function addSubscription() {
    const response = await fetch(
      withBasePath("/api/integrations/teams/subscriptions"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubscription),
      },
    );

    if (!response.ok) {
      pushToast(t("messages.subscriptionCreateFailed"));
      return;
    }

    setNewSubscription({
      teamId: "",
      channelId: "",
      teamName: "",
      channelName: "",
    });
    await refresh();
    pushToast(t("messages.subscriptionCreated"));
  }

  async function toggleSubscription(subscriptionId: string, active: boolean) {
    const response = await fetch(
      withBasePath(
        `/api/integrations/teams/subscriptions/${encodeURIComponent(subscriptionId)}`,
      ),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      },
    );
    if (!response.ok) {
      pushToast(t("messages.subscriptionUpdateFailed"));
      return;
    }
    await refresh();
  }

  async function removeSubscription(subscriptionId: string) {
    const response = await fetch(
      withBasePath(
        `/api/integrations/teams/subscriptions/${encodeURIComponent(subscriptionId)}`,
      ),
      { method: "DELETE" },
    );
    if (!response.ok) {
      pushToast(t("messages.subscriptionDeleteFailed"));
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("consent.title")}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {consentStatus.connected
              ? t("consent.connected")
              : t("consent.notConnected")}
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {consentStatus.expiresAt
              ? t("consent.expiresAt", {
                  value: formatDate(consentStatus.expiresAt),
                })
              : t("consent.noExpiry")}
          </p>
        </div>
        <a
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_14px_28px_-18px_var(--accent)] transition duration-200 ease-out hover:brightness-105 active:translate-y-px"
          href={withBasePath(
            "/api/integrations/teams/consent/start?redirectTo=/admin/integrations/teams",
          )}
        >
          {t("consent.connectButton")}
        </a>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("toggles.title")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] p-3">
            <span>{t("toggles.sendEnabled")}</span>
            <input
              type="checkbox"
              checked={config.sendEnabled}
              disabled={saving}
              onChange={(event) =>
                void saveConfig({ sendEnabled: event.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] p-3">
            <span>{t("toggles.intakeEnabled")}</span>
            <input
              type="checkbox"
              checked={config.intakeEnabled}
              disabled={saving}
              onChange={(event) =>
                void saveConfig({ intakeEnabled: event.target.checked })
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("targets.title")}
        </h2>
        <LinkParserControls
          label={t("linkParser.label")}
          placeholder={t("linkParser.placeholder")}
          buttonLabel={t("linkParser.apply")}
          value={targetLink}
          onChange={setTargetLink}
          onApply={applyLinkToTarget}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder={t("targets.name")}
            value={newTarget.name}
            onChange={(e) =>
              setNewTarget((v) => ({ ...v, name: e.target.value }))
            }
          />
          <Input
            placeholder={t("targets.teamId")}
            value={newTarget.teamId}
            onChange={(e) =>
              setNewTarget((v) => ({ ...v, teamId: e.target.value }))
            }
          />
          <Input
            placeholder={t("targets.channelId")}
            value={newTarget.channelId}
            onChange={(e) =>
              setNewTarget((v) => ({ ...v, channelId: e.target.value }))
            }
          />
          <Input
            placeholder={t("targets.teamName")}
            value={newTarget.teamName}
            onChange={(e) =>
              setNewTarget((v) => ({ ...v, teamName: e.target.value }))
            }
          />
          <Input
            placeholder={t("targets.channelName")}
            value={newTarget.channelName}
            onChange={(e) =>
              setNewTarget((v) => ({ ...v, channelName: e.target.value }))
            }
          />
        </div>
        <Button className="mt-3" onClick={() => void addTarget()} type="button">
          {t("targets.add")}
        </Button>
        <div className="mt-4 space-y-2">
          {targets.map((target) => (
            <div
              key={target.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] p-3"
            >
              <div className="min-w-[14rem] flex-1">
                <p className="font-medium">{target.name}</p>
                <p className="break-all font-mono text-xs text-[var(--muted-foreground)]">
                  {target.teamId} / {target.channelId}
                </p>
              </div>
              <ActiveDeleteControls
                active={target.active}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                deleteLabel={t("common.delete")}
                onToggle={(next) => void toggleTarget(target.id, next)}
                onDelete={() => void removeTarget(target.id)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("subscriptions.title")}
        </h2>
        <LinkParserControls
          label={t("linkParser.label")}
          placeholder={t("linkParser.placeholder")}
          buttonLabel={t("linkParser.apply")}
          value={subscriptionLink}
          onChange={setSubscriptionLink}
          onApply={applyLinkToSubscription}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder={t("subscriptions.teamId")}
            value={newSubscription.teamId}
            onChange={(e) =>
              setNewSubscription((v) => ({ ...v, teamId: e.target.value }))
            }
          />
          <Input
            placeholder={t("subscriptions.channelId")}
            value={newSubscription.channelId}
            onChange={(e) =>
              setNewSubscription((v) => ({ ...v, channelId: e.target.value }))
            }
          />
          <Input
            placeholder={t("subscriptions.teamName")}
            value={newSubscription.teamName}
            onChange={(e) =>
              setNewSubscription((v) => ({ ...v, teamName: e.target.value }))
            }
          />
          <Input
            placeholder={t("subscriptions.channelName")}
            value={newSubscription.channelName}
            onChange={(e) =>
              setNewSubscription((v) => ({ ...v, channelName: e.target.value }))
            }
          />
        </div>
        <Button
          className="mt-3"
          onClick={() => void addSubscription()}
          type="button"
        >
          {t("subscriptions.add")}
        </Button>
        <div className="mt-4 space-y-2">
          {subscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] p-3"
            >
              <div className="min-w-[14rem] flex-1">
                <p className="font-medium">
                  {subscription.teamName ?? subscription.teamId} /{" "}
                  {subscription.channelName ?? subscription.channelId}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t("subscriptions.lastPolled")}:{" "}
                  {subscription.lastPolledAt
                    ? formatDate(subscription.lastPolledAt)
                    : "-"}
                </p>
              </div>
              <ActiveDeleteControls
                active={subscription.active}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                deleteLabel={t("common.delete")}
                onToggle={(next) =>
                  void toggleSubscription(subscription.id, next)
                }
                onDelete={() => void removeSubscription(subscription.id)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("health.title")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {healthCards.map((card) => (
            <article
              key={card.label}
              className="rounded-lg border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_88%,var(--background)_12%)] p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {card.label}
              </p>
              <p className="mt-2 font-mono text-lg font-semibold">
                {String(card.value)}
              </p>
            </article>
          ))}
        </div>
        {sendWarnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">
              {t("messages.archivedChannelWarning")}
            </p>
            <div className="mt-2 space-y-1 text-sm">
              {sendWarnings.slice(0, 3).map((warning) => (
                <p key={`${warning.targetName}-${warning.timestamp}`}>
                  {warning.targetName} -{" "}
                  {warning.timestamp ? formatDate(warning.timestamp) : "-"}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

function isArchivedChannelSendError(error: string) {
  const normalized = error.toLowerCase();
  return (
    normalized.includes("archivemodifier") ||
    normalized.includes("aclcheckfailed-capability newpost") ||
    normalized.includes("insufficientprivileges")
  );
}

function parseTeamsChannelLink(link: string) {
  const value = link.trim();
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const teamId = url.searchParams.get("groupId")?.trim() ?? "";
  const parts = url.pathname.split("/").filter(Boolean);
  const channelIndex = parts.findIndex(
    (part) => part.toLowerCase() === "channel",
  );
  const rawChannelId = channelIndex >= 0 ? (parts[channelIndex + 1] ?? "") : "";
  const rawChannelName =
    channelIndex >= 0 ? (parts[channelIndex + 2] ?? "") : "";

  const channelId = decodeURIComponent(rawChannelId).trim();
  const channelName = decodeURIComponent(rawChannelName).trim();

  if (!teamId || !channelId) {
    return null;
  }

  return {
    teamId,
    channelId,
    channelName,
  };
}

function LinkParserControls({
  label,
  placeholder,
  buttonLabel,
  value,
  onChange,
  onApply,
}: {
  label: string;
  placeholder: string;
  buttonLabel: string;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[18rem] flex-1"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button onClick={onApply} type="button" variant="secondary">
          {buttonLabel}
        </Button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</p>
    </>
  );
}

function ActiveDeleteControls({
  active,
  activeLabel,
  inactiveLabel,
  deleteLabel,
  onToggle,
  onDelete,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  deleteLabel: string;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {active ? activeLabel : inactiveLabel}
      </label>
      <Button onClick={onDelete} type="button" variant="secondary">
        {deleteLabel}
      </Button>
    </>
  );
}
