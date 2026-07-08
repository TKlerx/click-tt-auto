import type { RelationalWish, Team } from "../types.js";

const relationWords = [
  {
    pattern: /\b(im\s+wechsel|wochenwechsel|gegenl[aä]ufig)\b/i,
    relation: "wechsel" as const
  },
  {
    pattern: /\b(zeitgleich|parallel|gemeinsam|gleiches\s+wochenende)\b/i,
    relation: "zeitgleich" as const
  }
];

function ordinalToLabel(value: string): string {
  const number = Number(value);
  return number === 1 ? "Erwachsene" : `Erwachsene ${"I".repeat(number)}`;
}

export function extractRelationalWishes(
  clubId: string,
  notes: string,
  teams: Team[]
): RelationalWish[] {
  const relation = relationWords.find((entry) =>
    entry.pattern.test(notes)
  )?.relation;
  if (!relation) return [];

  const explicit = [
    ...notes.matchAll(
      /(\d+)\.\s*(?:und|\/|\+)\s*(\d+)\.\s*(?:mannschaft|team)?/gi
    )
  ];
  const pairs =
    explicit.length > 0
      ? explicit.map(
          (match) =>
            [ordinalToLabel(match[1]!), ordinalToLabel(match[2]!)] as const
        )
      : [];

  return pairs.flatMap(([labelA, labelB]) => {
    const teamA = teams.find(
      (team) =>
        team.clubId === clubId &&
        team.label.toLowerCase() === labelA.toLowerCase()
    );
    const teamB = teams.find(
      (team) =>
        team.clubId === clubId &&
        team.label.toLowerCase() === labelB.toLowerCase()
    );
    if (!teamA || !teamB) return [];
    return [
      {
        clubId,
        teamA: teamA.id,
        teamB: teamB.id,
        relation,
        source: "freetext" as const,
        confidence: "review" as const
      }
    ];
  });
}

export function extractRequestedRasterzahlen(notes: string): number[] {
  return [...notes.matchAll(/rasterzahl(?:en)?\s*(\d{1,2})/gi)].map((match) =>
    Number(match[1])
  );
}
