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
  const groupSizes = splitIntoSupportedGroupSizes(teams.length);
  const parsedGroupNames = [
    ...text.matchAll(
      /\b(Bezirksoberliga|Bezirksliga|Bezirksklasse|Kreisliga|Gruppe)\b[^0-9\n]{0,80}(\d+)?/gi
    )
  ]
    .map((match, index) => ({
      league: match[1]!,
      name: match[2] ? `Gruppe ${match[2]}` : `Gruppe ${index + 1}`
    }))
    .slice(0, groupSizes.length);
  const groupNames =
    parsedGroupNames.length > 0
      ? parsedGroupNames
      : Array.from({ length: groupSizes.length }, (_, index) => ({
          league: "Unknown",
          name: `Review Group ${index + 1}`
        }));
  let offset = 0;
  const groups: Group[] = groupNames.map((ref, index) => {
    const size = groupSizes[index] ?? 0;
    const teamIds = teams.slice(offset, offset + size).map((team) => team.id);
    offset += size;
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

export function splitIntoSupportedGroupSizes(total: number): number[] {
  if (total <= 12) return [total];

  const minGroups = Math.ceil(total / 12);
  const maxGroups = Math.floor(total / 6);
  const preferred = Math.round(total / 10);
  const candidates = Array.from(
    { length: maxGroups - minGroups + 1 },
    (_, index) => minGroups + index
  ).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));

  for (const count of candidates) {
    const base = Math.floor(total / count);
    const extra = total % count;
    if (base >= 6 && base + (extra > 0 ? 1 : 0) <= 12) {
      return Array.from({ length: count }, (_, index) =>
        index < extra ? base + 1 : base
      );
    }
  }

  return Array.from({ length: Math.ceil(total / 10) }, (_, index) =>
    Math.min(10, total - index * 10)
  ).filter((size) => size > 0);
}
