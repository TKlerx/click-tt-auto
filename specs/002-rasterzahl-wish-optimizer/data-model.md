# Data Model: Rasterzahl Wish Optimizer

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

All types are plain data (no behavior). The `SeasonModel` is the human-reviewable artifact produced by ingest and consumed by scoring/optimization.

## Rulebook (constant, encoded once)

```
RasterSize            = 10 | 12 | 14                 // in scope; 6/8 optional
Template {
  size: RasterSize
  matchdays: Pairing[][]        // index = Spieltag-1; each Pairing = { home, away }
}
DerivedRaster {                 // precomputed from Template
  size: RasterSize
  homeSpieltage:  Map<Rasterzahl, number[]>   // matchdays this number is home
  derbySpieltag:  Map<PairKey, number>        // Spieltag where {a,b} meet
  homeWeeks:      Map<Rasterzahl, WeekSlot[]> // via Spielwochen
}
CrossSize {                     // korrespondierende Schlüsselzahlen
  a: RasterSize; b: RasterSize
  imWechsel:   Array<[Rasterzahl, Rasterzahl]>   // alternate across sizes
  zeitgleich:  Array<[Rasterzahl, Rasterzahl]>   // coincide across sizes
}
Spielwochen  = Map<RasterSize, number[]>          // Spieltag -> SHARED district calendar week index
                                                  // (same scale across all sizes, per PDF p.16, so
                                                  //  cross-size same-hall over-usage aligns on real weeks)
WeekSlot     = "A" | "B"
```

*Validation*: each `Template` covers `size-1` matchdays, every Rasterzahl `1..size` home the correct number of times; `DerivedRaster` for each size MUST reproduce the PDF's published Gegenläufige and same-club pairs (unit test, per `research.md`).

## Season inputs (yearly)

```
Club {
  id: string                 // WTTV number, e.g. "42724"
  name: string
  venues: Venue[]            // Spiellokal 1..3
  notes: string              // raw "Besondere Wünsche" free text
}
Venue { hall: "1"|"2"|"3"; name: string; capacity: number }   // capacity default 1

Team {
  id: string
  clubId: string
  label: string              // "Erwachsene", "Erwachsene II", "Jugend 19", …
  group?: GroupRef           // resolved during ingest
  homeWeekday: Weekday       // fixed by wish
  hall: "1"|"2"|"3"
  startTime?: string
  spielwochePref?: WeekSlot  // structured A/B preference, if stated
  rasterzahl:
    | { kind: "assignable" }
    | { kind: "fixed"; value: Rasterzahl }        // higher-league given
    | { kind: "pinned"; value: Rasterzahl }       // organizer override
  requestedRasterzahl?: Rasterzahl[]              // recorded, NON-binding (FR-015)
  confidence: "ok" | "review"                     // low-confidence extraction flag
}

Group { ref: GroupRef; size: number; teamIds: string[] }        // size 9..14
GroupRef = { league: string; name: string }

RelationalWish {
  clubId: string
  teamA: string; teamB: string
  relation: "wechsel" | "zeitgleich"   // alternate | coincide
  source: "freetext" | "spielwoche"
  confidence: "ok" | "review"          // auto-extracted → review
}

SeasonModel {
  clubs: Club[]
  teams: Team[]
  groups: Group[]
  wishes: RelationalWish[]
  absoluteConstraints: AbsoluteConstraint[]   // captured, not optimized v1 (FR-023)
  warnings: string[]                          // things needing manual review
}
AbsoluteConstraint { teamId: string; kind: "kalenderwoche"|"spieltage"; detail: string }
```

## Assignment & scoring

```
Assignment = Map<TeamId, Rasterzahl>          // decision variable

Weights { overUsage: number; overUsageFairness: number; wechsel: number; zeitgleich: number; spielwoche: number }

EvaluationResult {
  assignment: Assignment
  objective: number                            // weighted sum (FR-018)
  hardViolations: HardViolation[]              // permutation / fixed / derby breaches
  overUsages: OverUsage[]                       // (club, hall, weekday, week) count>capacity
  wishResults: WishResult[]                     // per wish: fulfilled|unfulfilled|unfulfillable|unknown + reason
  spielwocheMisses: { teamId; want: WeekSlot; got: WeekSlot }[]
  perGroup: Array<{ group: GroupRef; assignment: Map<TeamId,Rasterzahl>; valid: boolean }>
}
OverUsage   { clubId; hall; weekday: Weekday; week: number; teams: TeamId[]; capacity: number }
            // week = shared district calendar week (Spielwochen-aligned), comparable across raster sizes
HardViolation { kind: "permutation"|"fixed-altered"|"derby-late"; detail: string }
WishResult { wish: RelationalWish; status: "fulfilled"|"unfulfilled"|"unfulfillable"|"unknown"; reason?: string }
```

## Relationships

- `Team.clubId → Club`; `Team.group → Group`; `Group.teamIds → Team`.
- A `RelationalWish` references two `Team`s of one `Club`; evaluated via `DerivedRaster` (same size) or `CrossSize` (different sizes) once both Rasterzahlen are known.
- `Assignment` covers only `assignable`/`pinned` teams; `fixed` teams contribute their given value as constant context.
- Per group, the union of assigned + fixed + pinned Rasterzahlen MUST be a permutation of `1..size` (byes = top number for odd sizes).
