import fs from "node:fs/promises";
import type { Assignment, SeasonModel } from "../src/raster/types.ts";

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const [
  modelPath = "reports/raster/review-model.json",
  assignmentPath = "reports/raster/review-proposal.json",
  out = "reports/raster/optimized-raster-review.csv"
] = process.argv.slice(2);
const model = JSON.parse(await fs.readFile(modelPath, "utf8")) as SeasonModel;
const assignment = JSON.parse(await fs.readFile(assignmentPath, "utf8")) as Assignment;

await fs.writeFile(
  out,
  [
    "league,group,club,team,teamLabel,rasterzahl,rasterStatus,weekday,hall,startTime,weekSlot",
    ...model.groups.flatMap((group) =>
      group.teamIds.map((teamId) => {
        const team = model.teams.find((candidate) => candidate.id === teamId);
        const club = model.clubs.find((candidate) => candidate.id === team?.clubId);
        const fixed =
          team?.rasterzahl.kind === "fixed" || team?.rasterzahl.kind === "pinned"
            ? team.rasterzahl.value
            : undefined;
        return [
          group.ref.league,
          group.ref.name,
          club?.name,
          team?.name,
          team?.label,
          fixed ?? assignment[teamId],
          fixed ? team?.rasterzahl.kind : "optimized",
          team?.homeWeekday,
          team?.hall,
          team?.startTime,
          team?.spielwochePref
        ]
          .map(csvCell)
          .join(",");
      })
    )
  ].join("\n") + "\n",
  "utf8"
);

console.log(`wrote ${out} (${model.teams.length} teams)`);
