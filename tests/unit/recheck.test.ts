import { afterEach, expect, it, vi } from "vitest";
import type { AppConfig, MatchDetail, MatchEntry } from "../../src/types.js";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));
vi.mock("../../src/config.js", async (original) => ({ ...await original<object>(), loadConfig: vi.fn() }));
vi.mock("../../src/auth.js", () => ({ login: vi.fn(), ensureSessionActive: vi.fn() }));
vi.mock("../../src/navigation.js", () => ({ navigateToMatchSearch: vi.fn(), cancelAndReturn: vi.fn() }));
vi.mock("../../src/approver.js", () => ({ handleApproval: vi.fn() }));
vi.mock("../../src/match-list.js", () => ({ assertMatchListPage: vi.fn(), readMatchListPage: vi.fn(), findMatchLink: vi.fn(), goToNextPage: vi.fn() }));
vi.mock("../../src/match-detail.js", async (original) => ({ ...await original<object>(), readMatchDetailPage: vi.fn(), waitForMatchDetailPage: vi.fn() }));
vi.mock("../../src/fines.js", async (original) => ({ ...await original<object>(), loadFineWorkbookIndex: vi.fn(), syncFineWorkbook: vi.fn() }));
vi.mock("../../src/reporter.js", async (original) => ({ ...await original<object>(), writeRunReport: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it("rechecks past approved reports in scope and only cancels, even without --dry-run", async () => {
  const { chromium } = await import("playwright");
  const { loadConfig } = await import("../../src/config.js");
  const { handleApproval } = await import("../../src/approver.js");
  const { readMatchListPage, findMatchLink } = await import("../../src/match-list.js");
  const { readMatchDetailPage } = await import("../../src/match-detail.js");
  const { loadFineWorkbookIndex, syncFineWorkbook, deriveFineCandidates } = await import("../../src/fines.js");
  const { writeRunReport } = await import("../../src/reporter.js");
  const { run } = await import("../../src/index.js");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const group = "Bezirksoberliga Erwachsene";
  vi.mocked(loadConfig).mockReturnValue({
    recheck: true, dryRun: false, groups: [group], group: null, fineWorkbookPath: "fines.xlsx",
    fineSheetName: "Sheet1", fineIgnoreColumn: "Ignore", fineNaKosten: 100, fineCatalogue: null
  } as AppConfig);
  const page = { waitForLoadState: vi.fn() };
  const context = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
  vi.spyOn(chromium, "launch").mockResolvedValue({ newContext: vi.fn().mockResolvedValue(context), close: vi.fn() } as never);
  const match = { date: "04.09.2026 20:00", homeTeam: "Home", guestTeam: "Guest", group,
    status: "abgeschlossen", isApproved: true } as MatchEntry;
  vi.mocked(readMatchListPage).mockResolvedValue({
    allMatches: [match, { ...match, homeTeam: "Missing MF" }, { ...match, date: "01.01.2099 20:00" },
      { ...match, group: "2. Bezirksliga 1 Erwachsene" }],
    matches: [], totalMatches: 4, pagination: { currentPage: 1, totalPages: 1 }
  });
  vi.mocked(findMatchLink).mockResolvedValue({ count: vi.fn().mockResolvedValue(1), click: vi.fn() } as never);
  const players = Array.from({ length: 6 }, (_, index) => ({ position: index + 1, name: `Player ${index}`, rank: "1.1" }));
  const detail: MatchDetail = { matchFormat: "Sechser-Paarkreuz-System", isAlreadyApproved: true,
    homeTeam: { teamName: "Home", hasMF: true, playerCount: 6, players },
    guestTeam: { teamName: "Guest", hasMF: true, playerCount: 6, players }, hasErrorMessages: false, bemerkungen: "" };
  vi.mocked(readMatchDetailPage).mockResolvedValueOnce(detail).mockResolvedValueOnce({
    ...detail, homeTeam: { ...detail.homeTeam, teamName: "Missing MF", hasMF: false }
  });
  vi.mocked(loadFineWorkbookIndex).mockResolvedValue({ enabled: true, existingKeys: new Set(), ignoredKeys: new Set() });
  vi.mocked(syncFineWorkbook).mockResolvedValue({ enabled: true, totalCandidates: 1, appended: 1, existing: 0, ignored: 0 });
  vi.mocked(writeRunReport).mockResolvedValue("report.json");

  await run();

  expect(findMatchLink).toHaveBeenCalledTimes(2);
  expect(vi.mocked(handleApproval).mock.calls.map((call) => call.slice(1))).toEqual([[true, false], [true, false]]);
  const report = vi.mocked(writeRunReport).mock.calls[0]![0];
  expect(report).toMatchObject({ recheck: true, dryRun: false, totalApproved: 0, totalOpened: 2, totalErrors: 0 });
  expect(report.actions.map((action) => action.action)).toEqual(["checked", "skipped"]);
  expect(deriveFineCandidates(report.actions, [], {
    defaultLiga: null, defaultGruppe: null, spielleiter: null, naKosten: 100, fineCatalogue: null
  })).toHaveLength(1);
  expect(syncFineWorkbook).toHaveBeenCalledWith(expect.objectContaining({ createIfMissing: true, dryRun: false }));
});
