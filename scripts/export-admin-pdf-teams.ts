import fs from "node:fs/promises";
import path from "node:path";
import { parseWishesPdf } from "../src/raster/ingest/index.ts";

async function files(dir: string): Promise<string[]> {
  return (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(dir, entry.name));
}

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function divisionFromLabel(label: string): string {
  return label.replace(/\s+[IVX]+$/i, "");
}

const roots = process.argv.slice(2);
const pdfs =
  roots.length > 0
    ? roots
    : [
        ...(await files("reports/raster/clicktt-downloads")),
        "D:/dev/click-tt-automation/data/Terminmeldung_gesamt_bol.pdf",
        "D:/dev/click-tt-automation/data/Terminmeldung_gesamt_1bl1.pdf",
        "D:/dev/click-tt-automation/data/Terminmeldung_gesamt_1bl2.pdf"
      ];

const rows = [];
const seen = new Set<string>();
let duplicateCount = 0;
const assignmentRows = JSON.parse(
  await fs.readFile("reports/raster/team-raster-assignment.json", "utf8").catch(() => "[]")
) as Array<{ team: string; wishUrl?: string }>;
const clubByWishIndex = new Map(
  assignmentRows.flatMap((row) => {
    const key = row.wishUrl?.match(/\.81\.(\d+)\.15\./)?.[1];
    return key ? [[key, row.team.replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, "").trim()] as const] : [];
  })
);

for (const pdf of [...new Set(pdfs)]) {
  const parsed = await parseWishesPdf(pdf);
  const stem = path.basename(pdf, path.extname(pdf));
  const wishIndex = pdf.match(/\.81\.(\d+)\.15\./)?.[1];
  for (const team of parsed.teams) {
    const club = parsed.clubs.find((candidate) => candidate.id === team.clubId);
    const clubName = (wishIndex ? clubByWishIndex.get(wishIndex) : undefined) ?? club?.name ?? team.clubId;
    const canDedupe = clubName !== stem;
    const key = [
      clubName,
      team.label,
      team.homeWeekday,
      team.spielwochePref,
      team.hall,
      team.startTime
    ].join("\t");
    if (canDedupe && seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    if (canDedupe) seen.add(key);
    rows.push({
      sourcePdf: pdf,
      club: clubName,
      division: divisionFromLabel(team.label),
      teamLabel: team.label,
      weekday: team.homeWeekday,
      weekSlot: team.spielwochePref,
      hall: team.hall,
      startTime: team.startTime
    });
  }
}

await fs.mkdir("reports/raster", { recursive: true });
await fs.writeFile(
  "reports/raster/admin-pdf-teams.csv",
  [
    "sourcePdf,club,division,teamLabel,weekday,weekSlot,hall,startTime",
    ...rows.map((row) =>
      [
        row.sourcePdf,
        row.club,
        row.division,
        row.teamLabel,
        row.weekday,
        row.weekSlot,
        row.hall,
        row.startTime
      ]
        .map(csvCell)
        .join(",")
    )
  ].join("\n") + "\n",
  "utf8"
);

console.log(
  `wrote reports/raster/admin-pdf-teams.csv (${rows.length} rows from ${new Set(pdfs).size} PDFs, dropped ${duplicateCount} duplicates)`
);
