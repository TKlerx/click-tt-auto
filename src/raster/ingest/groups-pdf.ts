import { extractPdfText } from "./pdf-text.js";
import type { Group, Team } from "../types.js";

export interface GroupParseResult {
  groups: Group[];
  fixed: Map<string, number>;
  warnings: string[];
}

export async function parseGroupsPdf(
  filePath: string,
  teams: Team[]
): Promise<GroupParseResult> {
  const text = await extractPdfText(filePath);
  const parsedGroupNames = [
    ...text.matchAll(
      /\b(Bezirksoberliga|Bezirksliga|Bezirksklasse|Kreisliga|Gruppe)\b[^0-9\n]{0,80}(\d+)?/gi
    )
  ]
    .map((match, index) => ({
      league: match[1]!,
      name: match[2] ? `Gruppe ${match[2]}` : `Gruppe ${index + 1}`
    }))
    .slice(0, Math.max(1, Math.ceil(teams.length / 12)));
  const groupNames =
    parsedGroupNames.length > 0
      ? parsedGroupNames
      : Array.from({ length: Math.max(1, Math.ceil(teams.length / 12)) }, (_, index) => ({
          league: "Unknown",
          name: `Review Group ${index + 1}`
        }));
  const groups: Group[] = groupNames.map((ref, index) => {
    const teamIds = teams.slice(index * 12, index * 12 + 12).map((team) => team.id);
    return {
      ref,
      size: teamIds.length,
      teamIds
    };
  });
  const fixed = new Map<string, number>();

  for (const team of teams) {
    const escaped = team.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(
      new RegExp(`\\b(\\d{1,2})\\b[^\\n]{0,80}${escaped}`, "i")
    );
    if (match) fixed.set(team.id, Number(match[1]));
  }

  return {
    groups,
    fixed,
    warnings: [
      `${filePath}: group assignment parsed best-effort; verify group links and fixed Rasterzahlen.`
    ]
  };
}
