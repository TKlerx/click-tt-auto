import homeRows from "./templates.json" with { type: "json" };
import pairingRows from "./pairings.json" with { type: "json" };
import crossSizeRows from "./cross-size.json" with { type: "json" };
import spielwochen from "./spielwochen.json" with { type: "json" };
import type {
  DerivedRaster,
  PairKey,
  Pairing,
  RasterSize,
  RasterMode,
  Rasterzahl,
  Template
} from "../types.js";

const supportedSizes = [6, "6d", 8, 10, 12, 14] as const;

export function numericRasterSize(size: RasterSize): number {
  return size === "6d" ? 6 : size;
}

export function rasterSizeForGroupSize(
  size: number,
  mode: RasterMode = "single"
): RasterSize {
  if (size === 5) return 6;
  if (size === 6) return mode === "double" ? "6d" : 6;
  if (size === 7 || size === 8) return 8;
  if (size === 9 || size === 10) return 10;
  if (size === 11 || size === 12) return 12;
  if (size === 13 || size === 14) return 14;
  throw new Error(
    `Unsupported group size ${size}; supported district sizes are 5..14.`
  );
}

export function pairKey(a: number, b: number): PairKey {
  const [left, right] = a < b ? [a, b] : [b, a];
  return `${left}-${right}`;
}

function circlePairs(size: RasterSize): Pairing[][] {
  const override = (pairingRows as Partial<Record<RasterSize, Pairing[][]>>)[
    size
  ];
  if (override) return override;

  const numericSize = numericRasterSize(size);
  const teams = Array.from({ length: numericSize }, (_, index) => index + 1);
  const rounds: Pairing[][] = [];
  let rotating = teams.slice(1);

  for (let round = 0; round < numericSize - 1; round += 1) {
    const row = [teams[0]!, ...rotating];
    const rawPairs: Array<[number, number]> = [];
    for (let index = 0; index < numericSize / 2; index += 1) {
      rawPairs.push([row[index]!, row[numericSize - 1 - index]!]);
    }
    const homes = new Set(homeRows[size][round]);
    rounds.push(
      rawPairs.map(([a, b]) =>
        homes.has(a) ? { home: a, away: b } : { home: b, away: a }
      )
    );
    rotating = [rotating.at(-1)!, ...rotating.slice(0, -1)];
  }

  return rounds;
}

export function loadTemplate(size: RasterSize): Template {
  return { size, matchdays: circlePairs(size) };
}

export function allRasterSizes(): RasterSize[] {
  return [...supportedSizes];
}

export function deriveRaster(size: RasterSize): DerivedRaster {
  const template = loadTemplate(size);
  const weekMap = spielwochen[size];
  const homeSpieltage = new Map<Rasterzahl, number[]>();
  const derbySpieltag = new Map<PairKey, number>();
  const weeksByNumber = new Map<Rasterzahl, number[]>();

  for (let number = 1; number <= numericRasterSize(size); number += 1) {
    homeSpieltage.set(number, []);
    weeksByNumber.set(number, []);
  }

  for (const [roundIndex, pairings] of template.matchdays.entries()) {
    const spieltag = roundIndex + 1;
    const week = weekMap[roundIndex]!;
    const homes = homeRows[size][roundIndex]!;
    for (const home of homes) {
      homeSpieltage.get(home)!.push(spieltag);
      weeksByNumber.get(home)!.push(week);
    }
    for (const pairing of pairings) {
      const key = pairKey(pairing.home, pairing.away);
      if (!derbySpieltag.has(key)) derbySpieltag.set(key, spieltag);
    }
  }
  if (size !== "6d") {
    for (const [roundIndex, pairings] of template.matchdays.entries()) {
      const week = weekMap[template.matchdays.length + roundIndex]!;
      for (const pairing of pairings) {
        weeksByNumber.get(pairing.away)!.push(week);
      }
    }
  }

  return { size, homeSpieltage, derbySpieltag, homeWeeks: weeksByNumber };
}

export function homeWeeks(
  size: RasterSize,
  rasterzahl: number,
  groupSize: number = numericRasterSize(size),
  bye: number | null = groupSize % 2 === 1 ? numericRasterSize(size) : null
): number[] {
  if (rasterzahl === bye) return [];

  const weeks: number[] = [];
  const weekMap = spielwochen[size];
  const template = loadTemplate(size);
  for (const [roundIndex, pairings] of template.matchdays.entries()) {
    const pairing = pairings.find(
      (candidate) =>
        candidate.home === rasterzahl || candidate.away === rasterzahl
    );
    const homes = new Set(homeRows[size][roundIndex]);
    if (
      pairing &&
      homes.has(rasterzahl) &&
      pairing.home !== bye &&
      pairing.away !== bye
    ) {
      weeks.push(weekMap[roundIndex]!);
    }
  }
  if (size !== "6d") {
    for (const [roundIndex, pairings] of template.matchdays.entries()) {
      const pairing = pairings.find(
        (candidate) =>
          candidate.home === rasterzahl || candidate.away === rasterzahl
      );
      if (pairing && pairing.away === rasterzahl && pairing.home !== bye) {
        weeks.push(weekMap[template.matchdays.length + roundIndex]!);
      }
    }
  }
  return weeks;
}

export function derbySpieltag(
  size: RasterSize,
  a: number,
  b: number
): number | undefined {
  return deriveRaster(size).derbySpieltag.get(pairKey(a, b));
}

export function relation(
  sizeA: RasterSize,
  rzA: number,
  sizeB: RasterSize,
  rzB: number
): "wechsel" | "zeitgleich" | "neither" {
  if (sizeA === sizeB) {
    const rows = homeRows[sizeA];
    const a = new Set(
      rows.flatMap((homes, index) => (homes.includes(rzA) ? [index + 1] : []))
    );
    const b = new Set(
      rows.flatMap((homes, index) => (homes.includes(rzB) ? [index + 1] : []))
    );
    const overlap = [...a].filter((week) => b.has(week)).length;
    if (overlap === 0) return "wechsel";
    if (overlap === Math.min(a.size, b.size)) return "zeitgleich";
    return "neither";
  }
  if (sizeA !== sizeB) {
    for (const row of crossSizeRows) {
      if (row.a === sizeA && row.b === sizeB) {
        if (row.imWechsel.some(([a, b]) => a === rzA && b === rzB))
          return "wechsel";
        if (row.zeitgleich.some(([a, b]) => a === rzA && b === rzB))
          return "zeitgleich";
      }
      if (row.a === sizeB && row.b === sizeA) {
        if (row.imWechsel.some(([a, b]) => a === rzB && b === rzA))
          return "wechsel";
        if (row.zeitgleich.some(([a, b]) => a === rzB && b === rzA))
          return "zeitgleich";
      }
    }
  }
  const a = new Set(homeWeeks(sizeA, rzA));
  const b = new Set(homeWeeks(sizeB, rzB));
  const overlap = [...a].filter((week) => b.has(week)).length;
  if (overlap === 0) return "wechsel";
  if (overlap === Math.min(a.size, b.size)) return "zeitgleich";
  return "neither";
}
