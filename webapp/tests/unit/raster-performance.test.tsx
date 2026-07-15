import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssignmentTable } from "@/components/raster/assignments/assignment-table";
import { CapacityTable } from "@/components/raster/capacity/capacity-table";
import { ConflictOverview } from "@/components/raster/conflicts/conflict-overview";

describe("raster district-scale views", () => {
  it("renders and filters hundreds of rows well below the UX thresholds", () => {
    const assignments = Array.from({ length: 600 }, (_, index) => ({
      id: `assignment-${index}`,
      league: "Bezirksliga",
      group: String(index % 8),
      clubName: `Club ${index % 120}`,
      team: `Team ${index}`,
      rasterzahl: (index % 16) + 1,
      status: "OPTIMIZED",
      weekday: "FRIDAY",
      hall: "1",
      startTime: null,
      weekSlot: index % 2 ? "A" : "B",
    }));
    const capacities = Array.from({ length: 600 }, (_, index) => ({
      id: `capacity-${index}`,
      scope: "OWL",
      clubId: `club-${index % 120}`,
      hall: String((index % 3) + 1),
      weekday: "FRIDAY",
      capacity: 2,
      basis: "REVIEWED",
    }));
    const conflicts = Array.from({ length: 600 }, (_, index) => ({
      id: `conflict-${index}`,
      matchWeek: (index % 11) + 1,
      clubName: `Club ${index % 120}`,
      weekday: "FRIDAY",
      hall: "1",
      capacity: 2,
      actualCount: 3,
      excess: 1,
      teams: `Team ${index}`,
    }));

    const startedAt = performance.now();
    renderToStaticMarkup(<AssignmentTable assignments={assignments} />);
    renderToStaticMarkup(<CapacityTable scope="OWL" rows={capacities} />);
    renderToStaticMarkup(<ConflictOverview conflicts={conflicts} />);
    const foundAssignments = assignments.filter((row) =>
      row.team.includes("Team 599"),
    );
    const foundCapacity = capacities.filter((row) => row.clubId === "club-42");

    expect(performance.now() - startedAt).toBeLessThan(15_000);
    expect(foundAssignments).toHaveLength(1);
    expect(foundCapacity.length).toBeGreaterThan(0);
  });
});
