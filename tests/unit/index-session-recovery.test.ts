import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "../../src/session-recovery.js";
import type * as ReporterModule from "../../src/reporter.js";

const mocks = vi.hoisted(() => ({
  processAll: false,
  launch: vi.fn(), contextClose: vi.fn(), browserClose: vi.fn(),
  login: vi.fn(), navigate: vi.fn(), ensure: vi.fn(), assertList: vi.fn(),
  readList: vi.fn(), findLink: vi.fn(), next: vi.fn(), waitDetail: vi.fn(), readDetail: vi.fn(),
  approval: vi.fn(), validate: vi.fn(), buildReport: vi.fn(), writeReport: vi.fn(), sync: vi.fn(),
  progressUpdate: vi.fn(), progressLog: vi.fn(), progressFinish: vi.fn()
}));
vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));
vi.mock("../../src/config.js", () => ({ loadConfig: () => ({ baseUrl: "https://example.invalid", username: "u", password: "p", dryRun: false, headed: false, slowMoMs: 0, reportDir: "/tmp", group: undefined, fineWorkbookPath: undefined, processAll: mocks.processAll, debug: false, plainProgress: true, haltOnError: false, fineLiga: undefined, fineGruppe: undefined, fineSpielleiter: undefined, fineNaKosten: undefined, fineCatalogue: undefined, fineSheetName: undefined, fineIgnoreColumn: undefined }) }));
vi.mock("../../src/auth.js", () => ({ login: mocks.login, ensureSessionActive: mocks.ensure }));
vi.mock("../../src/navigation.js", () => ({ navigateToMatchSearch: mocks.navigate, cancelAndReturn: vi.fn() }));
vi.mock("../../src/match-list.js", () => ({ assertMatchListPage: mocks.assertList, readMatchListPage: mocks.readList, findMatchLink: mocks.findLink, goToNextPage: mocks.next }));
vi.mock("../../src/match-detail.js", () => ({ waitForMatchDetailPage: mocks.waitDetail, readMatchDetailPage: mocks.readDetail }));
vi.mock("../../src/approver.js", () => ({ handleApproval: mocks.approval }));
vi.mock("../../src/validator.js", () => ({ validateMatch: mocks.validate }));
vi.mock("../../src/progress.js", () => ({ ProgressReporter: class { update = mocks.progressUpdate; log = mocks.progressLog; finish = mocks.progressFinish; } }));
vi.mock("../../src/reporter.js", async () => {
  const actual = await vi.importActual<typeof ReporterModule>("../../src/reporter.js");
  return {
    ...actual,
    buildRunReport: (input: Parameters<typeof actual.buildRunReport>[0]) => {
      mocks.buildReport(input);
      return actual.buildRunReport(input);
    },
    formatStdoutReport: () => "report",
    writeRunReport: mocks.writeReport
  };
});
vi.mock("../../src/fines.js", () => ({ getStatusFineCandidateState: () => "disabled", loadFineWorkbookIndex: vi.fn(), syncFineWorkbook: mocks.sync }));

import { run } from "../../src/index.js";

const match = (name: string, approved = false) => ({ date: "2026-01-01", homeTeam: name, guestTeam: "Guests", group: "G", status: "abgeschlossen", isApproved: approved });
const detail = { homeTeam: { playerCount: 6 }, guestTeam: { playerCount: 6 }, isAlreadyApproved: false };
const list = (matches: ReturnType<typeof match>[]) => ({ allMatches: matches, pagination: { totalPages: 2 }, totalMatches: matches.length });

function arrange(expiries: number, serverApplied: boolean): void {
  const page = { waitForLoadState: vi.fn(), content: vi.fn() };
  mocks.contextClose.mockResolvedValue(undefined); mocks.browserClose.mockResolvedValue(undefined);
  mocks.launch.mockResolvedValue({ newContext: vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page), close: mocks.contextClose }), close: mocks.browserClose });
  mocks.ensure.mockResolvedValue(undefined); mocks.assertList.mockResolvedValue(undefined); mocks.login.mockResolvedValue(undefined); mocks.navigate.mockResolvedValue(undefined); mocks.validate.mockReturnValue({ isApprovable: true, checks: [] });
  mocks.findLink.mockResolvedValue({ count: vi.fn().mockResolvedValue(1), click: vi.fn().mockResolvedValue(undefined) });
  mocks.waitDetail.mockResolvedValue(undefined); mocks.readDetail.mockResolvedValue(detail); mocks.next.mockResolvedValue(true);
  const starter = match("Starter"); const target = match("Target"); const continuation = match("Continuation");
  mocks.readList.mockImplementation(() => {
    const call = mocks.readList.mock.calls.length;
    if (call === 1) return Promise.resolve(list([starter]));
    if (call === 2) return Promise.resolve(list([target]));
    return Promise.resolve(list([match("Target", serverApplied), continuation]));
  });
  let targetAttempts = 0;
  mocks.approval.mockImplementation(() => {
    const call = mocks.approval.mock.calls.length;
    if (call === 1) return Promise.resolve();
    if (call === 2 || (!serverApplied && call === 3)) {
      targetAttempts += 1;
      if (targetAttempts <= expiries) return Promise.reject(new SessionExpiredError());
    }
    if (targetAttempts < expiries) {
      targetAttempts += 1;
      return Promise.reject(new SessionExpiredError());
    }
    return Promise.resolve();
  });
  mocks.buildReport.mockImplementation(() => ({})); mocks.writeReport.mockResolvedValue("/tmp/report.json"); mocks.sync.mockResolvedValue({ enabled: false });
}

describe("run session recovery", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.processAll = false; });
  it("re-logs in, restarts traversal, re-reads the checkmark, and does not re-save an applied approval", async () => {
    arrange(1, true);
    await run();
    expect(mocks.login).toHaveBeenCalledTimes(2); expect(mocks.navigate).toHaveBeenCalledTimes(2);
    expect(mocks.next).toHaveBeenCalledTimes(2);
    expect(mocks.next).toHaveBeenNthCalledWith(1, expect.anything(), 1, expect.anything());
    expect(mocks.next).toHaveBeenNthCalledWith(2, expect.anything(), 1, expect.anything());
    expect(mocks.readList).toHaveBeenCalledTimes(4); expect(mocks.approval).toHaveBeenCalledTimes(3);
  });
  it("retries a post-save expiry once when the server checkmark remains clear", async () => {
    arrange(1, false);
    await run();
    expect(mocks.approval).toHaveBeenCalledTimes(4); expect(mocks.login).toHaveBeenCalledTimes(2);
  });
  it("fails after two post-save expiries on the same list page", async () => {
    arrange(3, false);
    await expect(run()).rejects.toThrow("after 2 recovery attempts while processing list page 2");
    expect(mocks.login).toHaveBeenCalledTimes(3); expect(mocks.approval).toHaveBeenCalledTimes(4);
  });
  it("enforces one two-recovery budget across page start, post-save, and pagination expiry", async () => {
    arrange(0, false);
    mocks.ensure.mockRejectedValueOnce(new SessionExpiredError());
    mocks.approval.mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(undefined);
    mocks.next.mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(true);

    await expect(run()).rejects.toThrow("after 2 recovery attempts while processing list page 1");
    expect(mocks.login).toHaveBeenCalledTimes(3);
  });

  it("reports one approved action when Save applied before an expiry redirect", async () => {
    arrange(0, false);
    const captured: unknown[] = [];
    mocks.writeReport.mockImplementation((report) => { captured.push(report); return Promise.resolve("/tmp/report.json"); });
    mocks.approval.mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(undefined);
    mocks.readList.mockImplementation(() => Promise.resolve(list([match("Target", mocks.readList.mock.calls.length >= 2)])));

    await run();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ totalApproved: 1, totalSkipped: 0, totalActionable: 1 });
    expect((captured[0] as { actions: Array<{ action: string }> }).actions.map((action) => action.action)).toEqual(["approved"]);
  });

  it("preserves a recovered approval audit action in process-all mode", async () => {
    arrange(0, false);
    mocks.processAll = true;
    mocks.approval.mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(undefined);
    mocks.readList.mockImplementation(() => Promise.resolve({
      ...list([match("Target", mocks.readList.mock.calls.length >= 2)]),
      pagination: { totalPages: 1 }
    }));

    await run();

    expect((mocks.buildReport.mock.calls[0]?.[0] as Parameters<typeof ReporterModule.buildRunReport>[0]).actions.map((action) => action.action)).toEqual(["approved"]);
  });

  it("reports one skipped action when Cancel expires after its side effect", async () => {
    arrange(0, false);
    const captured: unknown[] = [];
    mocks.validate.mockReturnValue({ isApprovable: false, checks: [{ passed: false, reason: "MF missing" }] });
    mocks.writeReport.mockImplementation((report) => { captured.push(report); return Promise.resolve("/tmp/report.json"); });
    mocks.approval.mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(undefined);

    await run();

    expect(captured[0]).toMatchObject({ totalApproved: 0, totalSkipped: 3, totalActionable: 3 });
    expect((captured[0] as { actions: Array<{ action: string; match: { homeTeam: string } }> }).actions.map((action) => `${action.action}:${action.match.homeTeam}`)).toEqual(["skipped:Starter", "skipped:Target", "skipped:Continuation"]);
  });

  it("restarts an unfiltered traversal to reconcile an applied save and process shifted matches", async () => {
    arrange(1, true);
    const captured: unknown[] = [];
    let recoverySearchIncludesApproved = false;
    mocks.navigate.mockImplementation((_page, _group, options: { onlyUnapproved: boolean }) => {
      recoverySearchIncludesApproved = !options.onlyUnapproved;
      return Promise.resolve();
    });
    mocks.readList.mockImplementation(() => {
      const call = mocks.readList.mock.calls.length;
      if (call === 1) return Promise.resolve(list([match("Starter")]));
      if (call === 2) return Promise.resolve(list([match("Target")]));
      return Promise.resolve(list(recoverySearchIncludesApproved ? [match("Target", true), match("Continuation")] : [match("Continuation")]));
    });
    mocks.writeReport.mockImplementation((report) => { captured.push(report); return Promise.resolve("/tmp/report.json"); });

    await run();

    expect(mocks.navigate).toHaveBeenNthCalledWith(2, expect.anything(), undefined, { onlyUnapproved: false });
    expect(mocks.approval).toHaveBeenCalledTimes(3);
    expect(captured[0]).toMatchObject({ totalApproved: 3, totalActionable: 3 });
    expect((captured[0] as { actions: Array<{ action: string; match: { homeTeam: string } }> }).actions.map((action) => `${action.action}:${action.match.homeTeam}`)).toEqual(["approved:Starter", "approved:Target", "approved:Continuation"]);
  });

  it("re-reads recovered page one before pagination can skip shifted matches", async () => {
    arrange(0, false);
    let currentPage = 1;
    let recovered = false;
    let expireAfterAdvance = false;
    mocks.navigate.mockImplementation(() => {
      currentPage = 1;
      recovered = mocks.navigate.mock.calls.length > 1;
      return Promise.resolve();
    });
    mocks.readList.mockImplementation(() => Promise.resolve(list(
      currentPage === 1
        ? [match("Starter"), ...(recovered ? [match("Shifted")] : [])]
        : []
    )));
    mocks.next.mockImplementation(() => {
      currentPage = 2;
      if (!recovered) expireAfterAdvance = true;
      return Promise.resolve(true);
    });
    mocks.ensure.mockImplementation(() => {
      if (expireAfterAdvance) {
        expireAfterAdvance = false;
        return Promise.reject(new SessionExpiredError());
      }
      return Promise.resolve();
    });

    await run();

    expect((mocks.buildReport.mock.calls[0]?.[0] as Parameters<typeof ReporterModule.buildRunReport>[0]).actions.map((action) => action.match.homeTeam)).toEqual(["Starter", "Shifted"]);
    expect(mocks.login).toHaveBeenCalledTimes(2);
  });

  it("spends the remaining page recovery budget when recovery itself expires", async () => {
    arrange(1, true);
    mocks.login.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new SessionExpiredError()).mockResolvedValue(undefined);

    await run();

    expect(mocks.login).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-session recovery failure without retrying it", async () => {
    arrange(1, true);
    mocks.login.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("login unavailable"));

    await expect(run()).rejects.toThrow("login unavailable");
    expect(mocks.login).toHaveBeenCalledTimes(2);
  });
});
