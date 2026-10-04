// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubAliasReview } from "@/components/raster/capacity/club-alias-review";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// UI regression context: actual rendered actions and kind-separated state, not payload helpers.
describe("rendered source identity review", () => {
  let root: Root;
  let host: HTMLDivElement;
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  const candidates = [
    {
      kind: "CLUB" as const,
      capacityRelevant: true,
      modelClubId: "Same raw",
      modelClubName: "Same raw",
      wishClubId: "club-1",
      wishClubName: "Canonical club",
      confidence: "FUZZY",
      source: "cache-sync",
    },
    {
      kind: "TEAM" as const,
      capacityRelevant: false,
      modelClubId: "Same raw",
      modelClubName: "Same raw",
      wishClubId: "team-1",
      wishClubName: "Canonical team",
      confidence: "FUZZY",
      source: "cache-sync",
    },
  ];
  const options = [
    { kind: "CLUB" as const, clubId: "club-1", clubName: "Canonical club" },
    { kind: "TEAM" as const, clubId: "team-1", clubName: "Canonical team" },
  ];
  async function render(canEdit: boolean) {
    await act(async () =>
      root.render(
        <ClubAliasReview
          inputSetId="workspace"
          canEdit={canEdit}
          candidates={candidates}
          wishClubOptions={options}
        />,
      ),
    );
  }
  it("keeps club and team controls independent even when their raw identities coincide", async () => {
    await render(true);
    const rows = host.querySelectorAll("tbody tr");
    expect(rows[0].querySelector("input")?.value).toBe(
      "Canonical club - club-1",
    );
    expect(rows[1].querySelector("input")?.value).toBe(
      "Canonical team - team-1",
    );
    await act(async () =>
      Array.from(rows[1].querySelectorAll("button"))
        .find((b) => b.textContent === "Accept suggestion")!
        .click(),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      kind: "TEAM",
      sourceClubId: "Same raw",
      targetClubId: "team-1",
      createNewIdentity: false,
    });
    expect(rows[0].textContent).not.toContain("mapped");
    expect(host.textContent).toContain("FUZZY / cache-sync");
    await act(async () => vi.advanceTimersByTime(600));
    expect(refresh).toHaveBeenCalled();
  });
  it("shows provenance but no mutation actions to read-only viewers", async () => {
    await render(false);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.textContent).toContain("Admin required");
    expect(
      Array.from(host.querySelectorAll("tbody input")).every(
        (input) => (input as HTMLInputElement).disabled,
      ),
    ).toBe(true);
  });
  it.each(["CLUB", "TEAM"])(
    "posts a create action for %s from the rendered UI",
    async (kind) => {
      await render(true);
      const row = host.querySelectorAll("tbody tr")[kind === "CLUB" ? 0 : 1];
      await act(async () =>
        Array.from(row.querySelectorAll("button"))
          .find((b) => b.textContent === "Create new identity")!
          .click(),
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        kind,
        createNewIdentity: true,
      });
    },
  );
});
