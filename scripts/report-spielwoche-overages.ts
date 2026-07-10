import fs from "node:fs/promises";
import { evaluate } from "../src/raster/score/index.ts";
import type { Assignment, SeasonModel } from "../src/raster/types.ts";

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const [
  modelPath = "reports/raster/review-model.json",
  assignmentPath = "reports/raster/review-proposal.json",
  out = "reports/raster/spielwoche-overages.csv"
] = process.argv.slice(2);
const model = JSON.parse(await fs.readFile(modelPath, "utf8")) as SeasonModel;
const assignment = JSON.parse(await fs.readFile(assignmentPath, "utf8")) as Assignment;
const result = evaluate(model, assignment);
const teamName = (teamId: string) => model.teams.find((team) => team.id === teamId)?.name ?? teamId;
const clubName = (clubId: string) => model.clubs.find((club) => club.id === clubId)?.name ?? clubId;

await fs.writeFile(
  out,
  [
    "matchWeek,club,weekday,hall,capacity,actualCount,excess,teams,message",
    ...result.overUsages.map((usage) => {
      const teams = usage.teams.map(teamName);
      const club = clubName(usage.clubId);
      return [
        usage.week,
        club,
        usage.weekday,
        usage.hall,
        usage.capacity,
        teams.length,
        usage.excess,
        teams.join("; "),
        `On match week ${usage.week}, ${teams.length} teams are assigned to ${club}/${usage.weekday}/Hall ${usage.hall}, but capacity is ${usage.capacity}.`
      ]
        .map(csvCell)
        .join(",");
    })
  ].join("\n") + "\n",
  "utf8"
);

console.log(`wrote ${out} (${result.overUsages.length} overages)`);
