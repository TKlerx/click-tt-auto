import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import { goToNextPage } from "../../src/match-list.js";
import { SessionExpiredError } from "../../src/session-recovery.js";

function pagerPage(currentPage: number, jumpToLogin: boolean, initiallyOnLogin = false): Page {
  let onLogin = initiallyOnLogin;
  const absent = { first() { return this; }, count: () => Promise.resolve(0) };
  const jump = {
    first() { return this; }, filter() { return this; }, count: () => Promise.resolve(1),
    click: () => { onLogin = jumpToLogin; return Promise.resolve(); }
  };
  return {
    getByRole: () => absent,
    locator: (selector: string) => {
      if (selector === "body") return { textContent: () => Promise.resolve(onLogin ? "Login password" : `Seite ${currentPage} / 20`) };
      if (selector.includes('input[type="password"]')) return { first() { return this; }, isVisible: () => Promise.resolve(onLogin) };
      return jump;
    },
    waitForLoadState: () => Promise.resolve()
  } as unknown as Page;
}

describe("actual match-list terminal expiry classification", () => {
  it("throws typed expiry after a page-ten intermediate jump navigates to login", async () => {
    await expect(goToNextPage(pagerPage(10, true), 10)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws typed expiry before accepting a missing direct next link on login", async () => {
    await expect(goToNextPage(pagerPage(1, false, true), 1)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("returns terminal false for an authenticated missing next link", async () => {
    await expect(goToNextPage(pagerPage(1, false), 1)).resolves.toBe(false);
  });

  it("returns terminal false for an authenticated jump without a revealed next link", async () => {
    await expect(goToNextPage(pagerPage(10, false), 10)).resolves.toBe(false);
  });
});
