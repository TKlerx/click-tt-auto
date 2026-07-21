import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "filter.all") return "All";
    if (key === "filter.added") return "Added";
    if (key === "title") return "Wish Import Review";
    if (key === "toReview") return `${values?.count} to review`;
    if (key === "addedInfoCount") return `${values?.count} wishes imported cleanly`;
    return key;
  },
}));

import { WishImportReviewPanel } from "@/components/raster/wish-import-review-panel";

describe("WishImportReviewPanel", () => {
  it("counts cleanly added wishes in the All tab", () => {
    const html = renderToStaticMarkup(
      <WishImportReviewPanel
        canEdit
        inputSetId="input-1"
        review={{
          conflicts: [],
          unmatchedRows: [],
          addedWishes: [wish("1"), wish("2")],
          settledMatches: [],
          missingWishes: [],
        }}
      />,
    );

    expect(html).toContain("Wish Import Review (0 to review)");
    expect(html).toContain("All (2)");
    expect(html).toContain("Added (2)");
  });
});

function wish(id: string) {
  return {
    id,
    clubId: `club-${id}`,
    clubName: `Club ${id}`,
    teamLabel: "Erwachsene",
    homeWeekday: "FRIDAY",
    hall: null,
    startTime: null,
    spielwochePref: null,
    requestedRasterzahl: null,
    notes: null,
  };
}
