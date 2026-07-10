import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGraphMailClient,
  createMailClient,
  getConfiguredMailProvider,
  hasRealGraphMailConfig,
  hasUsableMailConfig,
} from "@/lib/mail";

describe("mail provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the graph provider", () => {
    delete process.env.MAIL_PROVIDER;

    expect(getConfiguredMailProvider()).toBe("graph");
  });

  it("reports usable graph config only when real credentials are present", () => {
    vi.stubEnv("MAIL_PROVIDER", "graph");
    vi.stubEnv("GRAPH_CLIENT_ID", "replace-me");
    vi.stubEnv("GRAPH_CLIENT_SECRET", "replace-me");
    vi.stubEnv("GRAPH_TENANT_ID", "replace-me");

    expect(hasRealGraphMailConfig()).toBe(false);
    expect(hasUsableMailConfig()).toBe(false);

    vi.stubEnv("GRAPH_CLIENT_ID", "client-id");
    vi.stubEnv("GRAPH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GRAPH_TENANT_ID", "tenant-id");

    expect(hasRealGraphMailConfig()).toBe(true);
    expect(hasUsableMailConfig()).toBe(true);
  });

  it("creates a graph client from environment config", () => {
    vi.stubEnv("MAIL_PROVIDER", "graph");
    vi.stubEnv("GRAPH_CLIENT_ID", "client-id");
    vi.stubEnv("GRAPH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GRAPH_TENANT_ID", "tenant-id");

    expect(createMailClient().provider).toBe("graph");
    expect(createGraphMailClient().provider).toBe("graph");
  });
});
