# Phase 1 Data Model: nuLiga Team Roster Import

**Feature**: `009-nuliga-team-roster-import` | **Date**: 2026-07-15

Two new tables. **No existing model changes** — the roster is added alongside, and everything already there keeps working untouched (FR-032).

---

## New: RasterTeamRoster

One import of one Tabellen export, for one scope and season.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `scopeId` | `String` | FK to `Scope`, `onDelete: Restrict`. Uses feature 005's scope reference |
| `season` | `String` | |
| `sourceRegion` | `String` | The export's own `Region`, as read from the file |
| `sourceSeason` | `String` | The export's own `Saison`, as read from the file |
| `charset` | `RosterCharset` | Which encoding the file was read as (`UTF8` / `ISO_8859_15`) |
| `importedById` | `String` | FK to `User`, `onDelete: Restrict` |
| `importedAt` | `DateTime @default(now())` | |
| `teams` | `RasterRosterTeam[]` | |

**Indexes**: `@@index([scopeId, season, importedAt])`.

### Why `sourceRegion` / `sourceSeason` are stored

FR-005 requires verifying the export's Region and Saison match the scope it is imported for. Storing what the *file* claimed, rather than only what it was imported as, means a later mismatch is diagnosable rather than a mystery — someone can see the export said `Ostwestfalen/Lippe` while it was filed under a different Bezirk.

### Why `charset` is stored

R-301 sniffs uploads. Recording the answer makes a mojibake report answerable after the fact: if club names look wrong, the first question is which encoding was used, and guessing twice is worse than recording once.

---

## New: RasterRosterTeam

One team, as click-TT says it exists.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `rosterId` | `String` | FK to `RasterTeamRoster`, `onDelete: Cascade` |
| `vereinNr` | `String` | The club number. **Text, not an integer** — see below |
| `vereinName` | `String` | The club's name *as exported*. A label, not identity |
| `altersklasse` | `String` | `Erwachsene`, `Damen`, `Jugend 19`, `Jugend 15`, `Jugend 13` |
| `mannschaftNr` | `String` | The team's number within its club and age class |
| `liga` | `String` | |
| `gruppe` | `String` | |

**Uniqueness**: `@@unique([rosterId, vereinNr, altersklasse, mannschaftNr])`.  
**Indexes**: `@@index([rosterId, vereinNr])`, `@@index([rosterId, gruppe])`.

### The canonical key

`vereinNr` + `altersklasse` + `mannschaftNr` — **verified unique across all 404 rows** of the OWL 2026/27 export, with zero duplicates. That is what makes it identity rather than a hopeful composite.

It needs all three parts: `SC GW Paderborn` (42706) fields **six** adult teams, so `vereinNr` alone is a club, not a team; and a club can field both `Erwachsene 1` and `Jugend 19 1`, so `mannschaftNr` alone does not separate them either.

### Why `vereinNr` is text

It is an identifier that happens to look numeric. Nothing arithmetic is ever done to it. An integer column would silently eat leading zeros — irrelevant for WTTV's five-digit numbers today, and exactly the kind of assumption that breaks quietly when another Verband is added.

### `vereinName` is a label, not identity

FR-020: identity follows the number. A club renamed between exports keeps its identity; the name simply updates. This is also what makes the charset hazard survivable — `vereinNr` is ASCII digits, so a mis-decoded file corrupts `vereinName` and nothing else. The roster stays *correct* while looking wrong.

---

## New enum: RosterCharset

```
UTF8
ISO_8859_15
```

The two the nuLiga form offers. Not a general charset enum — if a third appears, adding it is a migration, which is the right amount of friction.

---

## Ignored on purpose

The export is a **standings** file that happens to carry a roster. These columns are read past and not stored (FR-007):

`Rang`, `Begegnungen`, `Siege`, `Unentschieden`, `Niederlagen`, `BaelleGewonnen`, `BaelleVerloren`, `SaetzeGewonnen`, `SaetzeVerloren`, `SpieleGewonnen`, `SpieleVerloren`, `PunkteGewonnen`, `PunkteVerloren`, `Status`

They are all zero before a season starts and irrelevant to planning after it. Storing them would invite someone to trust them, and this feature is not a results importer.

Also unstored: `Verband`, `Meisterschaft`, `VereinVerband`, `VereinRegion`, `MannschaftAltersklasse`. The first four are constant per export and captured by the roster's scope; `MannschaftAltersklasse` duplicates `Altersklasse` in the sample and should be checked against it at parse time rather than stored twice.

---

## Validation rules

| Rule | Source | Enforced |
|---|---|---|
| The export's Region and Saison match the import target | FR-005 | Service layer; reported, not silently accepted |
| Re-import duplicates nothing | FR-004 | `@@unique([rosterId, vereinNr, altersklasse, mannschaftNr])` + upsert |
| A club renamed between exports keeps identity | FR-020, SC-005 | Identity is `vereinNr`; `vereinName` updates |
| Umlauts survive | FR-013, SC-003 | R-301's charset handling; unit-tested both ways |
| Charset unclear ⇒ refuse | FR-012 | Mojibake markers (`Ã¼`, `Ã¶`, `Â`) in a file that decodes as UTF-8 ⇒ already double-encoded upstream |
| Standings columns are ignored | FR-007 | Parser reads past them |

---

## What this does *not* change

| Entity | Why it matters |
|---|---|
| `RasterWish` | Untouched. Feature 008 owns wishes. This supplies the identity 008 pairs against |
| `RasterInputSet` | Untouched. The roster is per scope + season, not per input set — several input sets share one roster |
| Season model JSON | Untouched. `splitTeamName`'s derived label survives; whether the roster should replace it is Q2, deferred |
| `Scope` | Reused as-is, via feature 005's scope reference |

**Dependency on feature 005**: `RasterTeamRoster.scopeId` needs 005's scope-keyed model. Against 004 the equivalent would be a `district` string — which is exactly the free-text scope-shaped string 005 exists to remove, so this should not be built before 005 lands.

---

## Migration approach

Additive. Two new tables, no existing model altered, nothing to convert. Scopes with no imported roster behave exactly as before (FR-032), which is what lets feature 008 ship without this one.

---

## Deferred, and why

**Q2 — should the roster replace `splitTeamName`'s label parsing?** `Altersklasse` is canonical and exact, and PR #10 had to align a duration heuristic across three implementations that all parse that label. Reading the roster instead would delete the heuristic rather than align it. But it only works for rostered scopes, so the label path survives regardless, and the change reaches into the season model — beyond this feature's "add an authority, change nothing else" shape. Decide once a roster exists and its coverage is known.

**Q3 — what happens when a later export changes the roster under an existing input set?** A team withdrew; a new team registered. Feature 008 answers the equivalent for wishes: propose, never overwrite. The same answer probably applies — but the roster is *authoritative* in a way wishes are not, so "the import wins" is more defensible here than there. Worth deciding deliberately rather than by analogy.
