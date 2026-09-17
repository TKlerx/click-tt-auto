import { describe, expect, it } from "vitest";
import { scrapeTeamRasterAssignments } from "../../src/raster/ingest/clicktt-assignments.js";

describe("manual baseline live navigation", () => {
  it("clicks duplicate group labels by occurrence and keeps clicked context", async () => {
    const clicked: number[] = [];
    let currentGroup = "";
    const links = [
      { text: "Group 1", href: "https://admin.test/a" },
      { text: "Group 1", href: "https://admin.test/b" }
    ];
    let anchorRead = 0;
    const page = {
      getByText: () => ({ click: () => Promise.resolve() }),
      getByRole: () => ({
        click: () => Promise.resolve(),
        evaluateAll: () => Promise.resolve([]),
        first: () => ({ textContent: () => Promise.resolve(null) }),
        nth: (index: number) => ({
          click: () => {
            clicked.push(index);
            currentGroup = index === 0 ? "A" : "B";
            return Promise.resolve();
          },
          evaluateAll: () => Promise.resolve([]),
          first: () => ({ textContent: () => Promise.resolve(null) }),
          nth: () => {
            throw new Error("unused");
          },
          textContent: () => Promise.resolve(null)
        }),
        textContent: () => Promise.resolve(null)
      }),
      waitForLoadState: () => Promise.resolve(),
      goto: () => Promise.resolve(),
      url: () => `https://admin.test/${currentGroup}`,
      locator: (selector: string) => ({
        click: () => Promise.resolve(),
        evaluateAll: () => {
          if (selector === "a") {
            anchorRead += 1;
            return Promise.resolve(
              anchorRead === 1
                ? links.map((link) => ({ group: link.text, href: link.href }))
                : undefined
            );
          }
          if (selector === "tr") {
            return Promise.resolve([
              {
                rasterzahl: currentGroup === "A" ? 1 : 2,
                team: `Team ${currentGroup}`
              }
            ]);
          }
          return Promise.resolve([]);
        },
        first: () => ({
          textContent: () => Promise.resolve(`Title ${currentGroup}`)
        }),
        nth: () => {
          throw new Error("unused");
        },
        textContent: () => Promise.resolve(null)
      })
    };

    const rows = await scrapeTeamRasterAssignments(page as never, {
      groupNamePattern: "^Group"
    });
    expect(clicked).toEqual([0, 1]);
    expect(rows.map((row) => [row.team, row.sourceUrl])).toEqual([
      ["Team A", "https://admin.test/A"],
      ["Team B", "https://admin.test/B"]
    ]);
  });
});
