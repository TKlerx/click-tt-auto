# Research & Reference: Rasterzahl Wish Optimizer

**Created**: 2026-07-07
**Feature**: [spec.md](./spec.md)
**Status**: Analyzed — rulebook decode verified against the published tables.

This document (a) inventories the real inputs, (b) proves the rulebook can be decoded mechanically, and (c) provides a hand-verified reference group for SC-001/002/003. All numbers below were derived from `data/Rasterzahlen_OWL_komplett.pdf` and cross-checked against that same PDF's own summary tables.

## 1. Input inventory

| File(s) | Role | Cadence |
| --- | --- | --- |
| `Rasterzahlen_OWL_komplett.pdf` | **Rulebook** — per-size templates (14/12/10/8/6er), Gegenläufige pairs, cross-size parity (*korrespondierende Schlüsselzahlen rasterübergreifend*), Spielwochen calendar | **Permanent constant** — encode once, never re-parse (FR-021) |
| `Terminmeldung_gesamt_*.pdf` | **Club wishes** — per club: venues (Spiellokal 1–3), per-team weekday+time+hall, structured Spielwoche A/B, free-text *Besondere Wünsche* | Yearly input |
| `Gruppen-und-Raster-2026.pdf` | **Group assignment + fixed higher-league Rasterzahlen** — each higher group lists teams `1..12`; the number *is* the fixed Rasterzahl | Yearly input |
| `*ScheduleReportFOP.pdf` | Generated Spielpläne (per group) | Validation only |

In scope: group sizes 6–14 → **6er / 8er / 10er / 12er / 14er** rasters (odd size rides the next-even raster; top number = bye). Six-team groups can use the normal 6er table or the official 6er Doppelrunde table; that mode must be reviewed as part of the season model. Only Rasterzahl is chosen; weekday/hall/time are fixed by the wish.

## 2. How to read a raster template (mechanical)

Each size's template is a grid of columns = **Spieltage** (single round → `N-1` matchdays). Each column lists that matchday's pairings as `HOME - AWAY` (home is the left number). From this alone we can derive, with no ambiguity:

- **Home Spieltage per Rasterzahl** = the matchdays where that number appears on the left.
- **Derby matchday for a pair `{a,b}`** = the single Spieltag where `a-b` (or `b-a`) appears. Needed for the same-club ≤3 constraint (FR-020).
- **Home-week parity** = which of the two alternating week slots a team's home games fall in. Two Rasterzahlen are **gegenläufig** (opposite parity, *im Wechsel*) exactly when their home-Spieltag sets are complementary; **gleichläufig** (same parity, *gemeinsam*) when they largely coincide.

The exact mapping Spieltag → calendar week (needed to align *different* sizes and to name the slots "A"/"B") comes from the **Spielwochen** table; within one size, parity follows directly from the home-set structure below.

## 3. Worked reference — 12er Raster (verified)

Decoded home team (left of each pairing) per Spieltag, from the PDF's 12er grid:

| ST | Home teams (Rasterzahlen) |
| --- | --- |
| 1 | 1, 2, 3, 4, 5, 6 |
| 2 | 12, 8, 9, 10, 11, 1 |
| 3 | 2, 3, 4, 5, 6, 7 |
| 4 | 12, 9, 10, 11, 1, 2 |
| 5 | 3, 4, 5, 6, 7, 8 |
| 6 | 12, 10, 11, 1, 2, 3 |
| 7 | 4, 5, 6, 7, 8, 9 |
| 8 | 12, 11, 1, 2, 3, 4 |
| 9 | 5, 6, 7, 8, 9, 10 |
| 10 | 12, 1, 2, 3, 4, 5 |
| 11 | 6, 7, 8, 9, 10, 11 |

(Each row is a full round of 6 matches over all 12 numbers; 11 matchdays × 6 = 66 pairings.)

### Home-Spieltag set per Rasterzahl

| R | Home Spieltage | #home |
| --- | --- | --- |
| 1 | 1, 2, 4, 6, 8, 10 | 6 |
| 2 | 1, 3, 4, 6, 8, 10 | 6 |
| 3 | 1, 3, 5, 6, 8, 10 | 6 |
| 4 | 1, 3, 5, 7, 8, 10 | 6 |
| 5 | 1, 3, 5, 7, 9, 10 | 6 |
| 6 | 1, 3, 5, 7, 9, 11 | 6 |
| 7 | 3, 5, 7, 9, 11 | 5 |
| 8 | 2, 5, 7, 9, 11 | 5 |
| 9 | 2, 4, 7, 9, 11 | 5 |
| 10 | 2, 4, 6, 9, 11 | 5 |
| 11 | 2, 4, 6, 8, 11 | 5 |
| 12 | 2, 4, 6, 8, 10 | 5 |

Sum of #home = 6·6 + 5·6 = 66 ✓ (self-consistent with the grid).

### Verification A — Gegenläufige Rasterzahlen

The PDF lists 12er gegenläufig pairs: **6-12, 9-3, 8-2, 7-1, 5-11, 4-10**. Predicted by "home-sets are complementary (disjoint, union = ST 1..11)":

| Pair | Home sets | Disjoint? | Union = 1..11? | Gegenläufig? |
| --- | --- | --- | --- | --- |
| 6 / 12 | {1,3,5,7,9,11} / {2,4,6,8,10} | yes | yes | ✓ |
| 3 / 9 | {1,3,5,6,8,10} / {2,4,7,9,11} | yes | yes | ✓ |
| 2 / 8 | {1,3,4,6,8,10} / {2,5,7,9,11} | yes | yes | ✓ |
| 1 / 7 | {1,2,4,6,8,10} / {3,5,7,9,11} | yes | yes | ✓ |
| 5 / 11 | {1,3,5,7,9,10} / {2,4,6,8,11} | yes | yes | ✓ |
| 4 / 10 | {1,3,5,7,8,10} / {2,4,6,9,11} | yes | yes | ✓ |

**All six published pairs reproduced exactly.** → The decode and the "complementary home-set = opposite week parity" definition are correct.

### Verification B — Same-club-in-one-group recommendation + derby ≤3

The PDF recommends, for two teams of one club in the same 12er group: **6-7** and **1-12**, both *Heimspiele gemeinsam* (home together).

- **6 / 7**: home sets {1,3,5,7,9,11} vs {3,5,7,9,11} → 7's home days are a subset of 6's → home together on all 5 of 7's home days (*gemeinsam* ✓). Derby: `6-7` appears on **Spieltag 1** ✓ (≤3).
- **1 / 12**: {1,2,4,6,8,10} vs {2,4,6,8,10} → 12 ⊂ 1 → *gemeinsam* ✓. Derby: `1-12` on **Spieltag 1** ✓ (≤3).

**Both recommendations reproduced**, confirming FR-020 (derby ≤3) and the gleichläufig/gemeinsam classification fall straight out of the same decode.

### Derby matchday lookup

The Section-2 home-team table *is* the derby lookup: the Spieltag of pair `{a,b}` is the row where they appear together. E.g. `2-3`→ST4, `3-4`→ST6, `5-6`→ST10. For the same-club ≤3 rule, only pairs appearing in ST1–ST3 qualify without fallback; ST4 pairs use the FR-020 fallback; later is a violation.

## 4. What this proves for the plan

- The scorer's core (Rasterzahl → home weeks, derby matchday, gegenläufig/gleichläufig) is a **table lookup over a pre-encoded constant**, not a scheduling solver — cheap and exact. Confirms SC-001/002/003 are achievable by encoding the five templates once and validating each against its published Gegenläufige + same-club tables (as done here for 12er).
- The optimizer's hard constraints (per-group permutation, fixed Rasterzahlen, derby ≤3/≤4) and soft penalties (hall over-usage, im Wechsel, zeitgleich, Spielwoche A/B) are all evaluable from these lookups.

## 5. Open items to resolve during planning

- **Spielwochen → absolute A/B naming and cross-size alignment**: transcribe the Spielwochen table (PDF p.16) and the cross-size *korrespondierende Schlüsselzahlen* tables (pp.13–15) into encoded constants; verify the 10er and 14er templates the same way this doc verified 12er.
- **Wish-PDF parsing**: the *Terminmeldung* tables are column-misaligned and mix Vor-/Rückrunde rows; the relational wishes live in free-text. Plan the auto-extract + human-review model (US1) accordingly.
- **Group-membership source**: `Gruppen-und-Raster-2026.pdf` covers higher (fixed) leagues; the district groups' own rosters/sizes must come from the district group listing (PDF or click-TT scrape, US4).
