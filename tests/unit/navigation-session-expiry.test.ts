import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";

const { ensureSessionActive, assertMatchListPage } = vi.hoisted(() => ({
  ensureSessionActive: vi.fn(),
  assertMatchListPage: vi.fn()
}));

vi.mock("../../src/auth.js", () => ({ ensureSessionActive }));
vi.mock("../../src/match-list.js", () => ({ assertMatchListPage }));

import { cancelAndReturn, returnToListAfterSave } from "../../src/navigation.js";
import { SessionExpiredError } from "../../src/session-recovery.js";

function pageAfterSave(): Page {
  const control = {
    count: vi.fn().mockResolvedValue(1),
    first: vi.fn().mockReturnThis(),
    click: vi.fn().mockResolvedValue(undefined)
  };
  return {
    getByRole: vi.fn().mockReturnValue(control),
    locator: vi.fn().mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis()
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined)
  } as unknown as Page;
}

describe("post-navigation session expiry detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("classifies a login redirect immediately after Save before treating it as a return-to-list failure", async () => {
    ensureSessionActive.mockRejectedValueOnce(new Error("session expired"));

    await expect(returnToListAfterSave(pageAfterSave())).rejects.toThrow("session expired");
    expect(ensureSessionActive).toHaveBeenCalledTimes(1);
    expect(assertMatchListPage).not.toHaveBeenCalled();
  });

  it("classifies a login redirect after Cancel before treating it as a list-page failure", async () => {
    ensureSessionActive.mockRejectedValueOnce(new Error("session expired"));

    await expect(cancelAndReturn(pageAfterSave())).rejects.toThrow("session expired");
    expect(ensureSessionActive).toHaveBeenCalledTimes(1);
    expect(assertMatchListPage).not.toHaveBeenCalled();
  });

  it("preserves typed expiry when goBack is the only return path and lands on login", async () => {
    const goBack = vi.fn().mockResolvedValue(null);
    const page = {
      getByRole: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        first: vi.fn().mockReturnThis()
      }),
      locator: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        first: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue(0),
        allTextContents: vi.fn().mockResolvedValue([])
      }),
      goBack
    } as unknown as Page;
    const expiry = new SessionExpiredError();
    ensureSessionActive.mockResolvedValueOnce(undefined).mockRejectedValueOnce(expiry);
    assertMatchListPage.mockRejectedValueOnce(new Error("not on list"));

    await expect(returnToListAfterSave(page)).rejects.toBe(expiry);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(ensureSessionActive).toHaveBeenCalledTimes(2);
  });
});
