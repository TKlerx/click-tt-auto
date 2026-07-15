import { describe, expect, it } from "vitest";
import {
  defaultRasterStep,
  deriveRasterReadiness,
} from "@/lib/raster/readiness";

describe("raster readiness", () => {
  it("maps blocking reasons to the step that resolves them", () => {
    const readiness = deriveRasterReadiness({
      sourceCount: 1,
      inputSet: {
        status: "DRAFT",
        seasonModelJson: JSON.stringify({
          groups: [{ size: 6, teamIds: ["team-1"] }],
          teams: [{ id: "team-1", capacityRelevant: true }],
        }),
      },
      capacityReview: { blockingCount: 1 },
      matchReviewOutstandingCount: 1,
    });

    expect(readiness.review.outstanding).toEqual([
      "Confirm six-team group mode",
      "Review gym capacities",
      "Review source-to-model matches",
    ]);
    expect(readiness.run.state).toBe("blocked");
    expect(readiness.run.resolvedBy).toBe("review");
  });

  it("keeps exclusions visible without making them a blocking gap", () => {
    const readiness = deriveRasterReadiness({
      sourceCount: 1,
      inputSet: {
        status: "READY",
        seasonModelJson: JSON.stringify({
          groups: [
            {
              planningStatus: "exclude",
              teamIds: ["team-1"],
            },
          ],
          teams: [{ id: "team-1", capacityRelevant: false }],
        }),
        runs: [{ snapshot: { id: "snapshot-1" } }],
      },
      capacityReview: { blockingCount: 0 },
    });

    expect(readiness.review.state).toBe("ready");
    expect(readiness.review.outstanding).toEqual([]);
    expect(readiness.review.hasExclusions).toBe(true);
    expect(readiness.run.state).toBe("ready");
    expect(readiness.run.hasExclusions).toBe(true);
  });

  it("chooses the first outstanding step and falls through to runs", () => {
    expect(
      defaultRasterStep(
        deriveRasterReadiness({
          sourceCount: 0,
          inputSet: null,
        }),
      ),
    ).toBe("import");

    expect(
      defaultRasterStep(
        deriveRasterReadiness({
          sourceCount: 1,
          inputSet: {
            status: "READY",
            seasonModelJson: JSON.stringify({ groups: [], teams: [] }),
            runs: [{ snapshot: { id: "snapshot-1" } }],
          },
          capacityReview: { blockingCount: 0 },
        }),
      ),
    ).toBe("runs");
  });
});
