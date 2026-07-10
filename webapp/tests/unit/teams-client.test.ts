import { describe, expect, it, vi } from "vitest";
import { createGraphTeamsClient } from "@/lib/teams/client";

describe("teams client", () => {
  it("sends a channel message and returns id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "token", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "graph-message-1" }), {
          status: 201,
        }),
      );

    const client = createGraphTeamsClient({
      clientId: "cid",
      clientSecret: "secret",
      tenantId: "tenant",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.sendChannelMessage({
      teamId: "team-1",
      channelId: "channel-1",
      content: "Hello team",
    });

    expect(result.messageId).toBe("graph-message-1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws for graph 4xx/5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "token", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    const client = createGraphTeamsClient({
      clientId: "cid",
      clientSecret: "secret",
      tenantId: "tenant",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.sendChannelMessage({
        teamId: "team-1",
        channelId: "channel-1",
        content: "Hello team",
      }),
    ).rejects.toThrow(/Graph Teams request failed: 403/);
  });

  it("has no reply/update/delete methods (FR-011)", () => {
    const client = createGraphTeamsClient({
      clientId: "cid",
      clientSecret: "secret",
      tenantId: "tenant",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    }) as unknown as Record<string, unknown>;

    expect(client.sendChannelMessage).toBeTypeOf("function");
    expect(client.listChannelMessages).toBeTypeOf("function");
    expect(client.getChannelMessagesDelta).toBeTypeOf("function");
    expect(client.replyMessage).toBeUndefined();
    expect(client.updateMessage).toBeUndefined();
    expect(client.deleteMessage).toBeUndefined();
  });
});
