import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { NotificationEventType } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/services/teams/admin", () => ({
  getOrCreateTeamsConfig: vi.fn(),
}));

const { createGraphTeamsClient } = vi.hoisted(() => ({
  createGraphTeamsClient: vi.fn(),
}));

vi.mock("@/lib/teams/client", () => ({
  createGraphTeamsClient,
}));

import { getOrCreateTeamsConfig } from "@/services/teams/admin";
import {
  queueTeamsMessages,
  safeQueueTeamsMessages,
} from "@/services/teams/service";
import { processTeamsIntakePoll } from "@/services/teams/intake";

describe("teams service", () => {
  beforeEach(() => {
    process.env.TEAMS_ENABLED = "true";
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    (
      getOrCreateTeamsConfig as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "cfg-1",
      sendEnabled: true,
      intakeEnabled: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.TEAMS_ENABLED;
  });

  it("queues outbound jobs for each active target", async () => {
    prismaMock.teamsDeliveryTarget.findMany.mockResolvedValue([
      { id: "target-1", teamId: "team-1", channelId: "channel-1" },
      { id: "target-2", teamId: "team-2", channelId: "channel-2" },
    ] as never);
    prismaMock.teamsOutboundMessage.create
      .mockResolvedValueOnce({ id: "outbound-1" } as never)
      .mockResolvedValueOnce({ id: "outbound-2" } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);

    await queueTeamsMessages({
      actorId: "admin-1",
      eventType: NotificationEventType.USER_CREATED,
      eventId: "event-1",
      payload: { userEmail: "user@example.com" },
    });

    expect(prismaMock.teamsOutboundMessage.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "teams_message_delivery",
          createdByUserId: "admin-1",
        }),
      }),
    );

    const firstPayload = JSON.parse(
      prismaMock.backgroundJob.create.mock.calls[0]?.[0]?.data?.payload ?? "{}",
    ) as Record<string, unknown>;
    expect(firstPayload).not.toHaveProperty("delegatedAccessToken");
  });

  it("truncates content above 28KB", async () => {
    prismaMock.teamsDeliveryTarget.findMany.mockResolvedValue([
      { id: "target-1", teamId: "team-1", channelId: "channel-1" },
    ] as never);
    prismaMock.teamsOutboundMessage.create.mockResolvedValue({
      id: "outbound-1",
    } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);

    await queueTeamsMessages({
      actorId: "admin-1",
      eventType: NotificationEventType.USER_CREATED,
      eventId: "event-1",
      payload: { big: "x".repeat(30_000) },
    });

    expect(prismaMock.teamsOutboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          truncated: true,
        }),
      }),
    );
  });

  it("does nothing when teams is disabled (FR-012 guard)", async () => {
    process.env.TEAMS_ENABLED = "false";

    await queueTeamsMessages({
      actorId: "admin-1",
      eventType: NotificationEventType.USER_CREATED,
      payload: {},
    });

    expect(prismaMock.teamsDeliveryTarget.findMany).not.toHaveBeenCalled();
  });

  it("ingests delta messages and updates poll state", async () => {
    (
      getOrCreateTeamsConfig as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "cfg-1",
      sendEnabled: true,
      intakeEnabled: true,
    });
    prismaMock.teamsIntakeSubscription.findMany.mockResolvedValue([
      {
        id: "sub-1",
        teamId: "team-1",
        channelId: "channel-1",
        deltaToken: null,
      },
    ] as never);
    prismaMock.teamsInboundMessage.findUnique.mockResolvedValue(null as never);
    prismaMock.teamsInboundMessage.create.mockResolvedValue({
      id: "inbound-1",
    } as never);
    prismaMock.teamsIntakeSubscription.update.mockResolvedValue({
      id: "sub-1",
    } as never);
    (
      createGraphTeamsClient as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      getChannelMessagesDelta: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "provider-1",
            teamId: "team-1",
            channelId: "channel-1",
            content: "<p>Hello</p>",
            contentType: "html",
            createdAt: "2026-04-27T10:00:00Z",
            senderDisplayName: "User One",
            senderUserId: "u-1",
          },
        ],
        deltaToken: "/delta-1",
      }),
    });

    const result = await processTeamsIntakePoll();

    expect(result.created).toBe(1);
    expect(prismaMock.teamsInboundMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.teamsIntakeSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deltaToken: "/delta-1",
        }),
      }),
    );
  });

  it("logs queue failures as structured operational events", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (
      getOrCreateTeamsConfig as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("db unavailable"));

    await safeQueueTeamsMessages({
      actorId: "admin-1",
      eventType: NotificationEventType.USER_CREATED,
      eventId: "event-1",
      payload: { userEmail: "user@example.com" },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const raw = String(errorSpy.mock.calls[0][0]);
    const payload = JSON.parse(raw);
    expect(payload).toMatchObject({
      event: "teams.queue_failed",
      component: "teams",
      actorId: "admin-1",
      eventType: NotificationEventType.USER_CREATED,
      eventId: "event-1",
    });
    expect(raw).not.toContain("user@example.com");
  });
});
