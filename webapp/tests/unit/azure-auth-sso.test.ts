import { describe, expect, it, vi } from "vitest";
import { extractAzureIdentity, fetchAzureUserProfile } from "@/lib/azure-auth";

describe("azure auth SSO safety", () => {
  it("throws when Graph userinfo fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("upstream failure", {
          status: 502,
        }),
      ),
    );

    await expect(
      fetchAzureUserProfile("token", "header.payload.signature"),
    ).rejects.toThrow("Azure userinfo failed: 502 upstream failure");
  });

  it("throws when the profile has no email", () => {
    expect(() => extractAzureIdentity({ name: "Nameless User" })).toThrow(
      "Azure AD did not return an email address.",
    );
  });
});
