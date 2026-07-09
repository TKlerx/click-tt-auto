export type RasterSize = 10 | 12 | 14;
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type WeekSlot = "A" | "B";
export type Rasterzahl = number;
export type PairKey = `${number}-${number}`;

export interface Pairing {
  home: Rasterzahl;
  away: Rasterzahl;
}

export interface Template {
  size: RasterSize;
  matchdays: Pairing[][];
}

export interface DerivedRaster {
  size: RasterSize;
  homeSpieltage: Map<Rasterzahl, number[]>;
  derbySpieltag: Map<PairKey, number>;
  homeWeeks: Map<Rasterzahl, number[]>;
}

export interface CrossSize {
  a: RasterSize;
  b: RasterSize;
  imWechsel: Array<[Rasterzahl, Rasterzahl]>;
  zeitgleich: Array<[Rasterzahl, Rasterzahl]>;
}

export interface Venue {
  hall: string;
  name: string;
  capacity?: number;
  capacityByWeekday?: Partial<Record<Weekday, number>>;
}

export interface GroupRef {
  league: string;
  name: string;
}

export interface Club {
  id: string;
  name: string;
  venues: Venue[];
  notes: string;
}

export interface Team {
  id: string;
  clubId: string;
  name?: string;
  label: string;
  group?: GroupRef;
  homeWeekday: Weekday;
  hall: string;
  startTime?: string;
  spielwochePref?: WeekSlot;
  rasterzahl:
    | { kind: "assignable" }
    | { kind: "fixed"; value: Rasterzahl }
    | { kind: "pinned"; value: Rasterzahl };
  requestedRasterzahl?: Rasterzahl[];
  confidence: "ok" | "review";
}

export interface Group {
  ref: GroupRef;
  size: number;
  teamIds: string[];
}

export interface RelationalWish {
  clubId: string;
  teamA: string;
  teamB: string;
  relation: "wechsel" | "zeitgleich";
  source: "freetext" | "spielwoche";
  confidence: "ok" | "review";
}

export interface AbsoluteConstraint {
  teamId: string;
  kind: "kalenderwoche" | "spieltage";
  detail: string;
}

export interface SeasonModel {
  clubs: Club[];
  teams: Team[];
  groups: Group[];
  wishes: RelationalWish[];
  absoluteConstraints: AbsoluteConstraint[];
  warnings: string[];
}

export type Assignment = Record<string, Rasterzahl>;

export interface Weights {
  overUsage: number;
  overUsageFairness: number;
  wechsel: number;
  zeitgleich: number;
  spielwoche: number;
}

export interface OverUsage {
  clubId: string;
  hall: string;
  weekday: Weekday;
  week: number;
  teams: string[];
  capacity: number;
  excess: number;
}

export interface HardViolation {
  kind: "permutation" | "fixed-altered" | "derby-late" | "capacity-overflow";
  detail: string;
}

export interface WishResult {
  wish: RelationalWish;
  status: "fulfilled" | "unfulfilled" | "unfulfillable" | "unknown";
  reason?: string;
}

export interface EvaluationResult {
  assignment: Assignment;
  objective: number;
  hardViolations: HardViolation[];
  overUsages: OverUsage[];
  wishResults: WishResult[];
  spielwocheMisses: Array<{ teamId: string; want: WeekSlot; got: WeekSlot }>;
  perGroup: Array<{ group: GroupRef; assignment: Assignment; valid: boolean }>;
}

export const defaultWeights: Weights = {
  overUsage: 10,
  overUsageFairness: 1,
  wechsel: 5,
  zeitgleich: 5,
  spielwoche: 0
};
