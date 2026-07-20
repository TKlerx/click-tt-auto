import { describe, expect, it } from "vitest";
import { resolveWorkspaceSelection } from "@/lib/raster/workspace-selection";

const workspaces = [
  { id: "input-a", name: "A", scopeId: "owl", season: "2026/27" },
  { id: "input-b", name: "B", scopeId: "owl", season: "2026/27" },
];

describe("workspace selection", () => {
  it("prompts when no workspace exists", () => {
    expect(resolveWorkspaceSelection([], null)).toMatchObject({
      selected: null,
      showSelector: false,
      staleRequested: false,
    });
  });

  it("auto-selects the only workspace", () => {
    expect(resolveWorkspaceSelection([workspaces[0]], null)).toMatchObject({
      selected: workspaces[0],
      showSelector: false,
    });
  });

  it("uses the requested workspace when several exist", () => {
    expect(resolveWorkspaceSelection(workspaces, "input-b")).toMatchObject({
      selected: workspaces[1],
      showSelector: true,
      staleRequested: false,
    });
  });

  it("ignores stale workspace ids", () => {
    expect(resolveWorkspaceSelection(workspaces, "other")).toMatchObject({
      selected: null,
      showSelector: true,
      staleRequested: true,
    });
  });
});
