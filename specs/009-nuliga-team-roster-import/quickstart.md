# Quickstart: nuLiga Team Roster Import

**Feature**: `009-nuliga-team-roster-import` | **Date**: 2026-07-15

---

## The one thing to internalise

**A wrong character set does not throw. It succeeds and lies.**

ISO-8859-15 maps every byte, so it can never fail to decode. Assume it, hand it a UTF-8 export, and you record `TTV GrÃŒn-WeiÃ Daseburg` and report success. Umlauts are common in German club names, so that is the *normal* case, not an edge case.

Everything else here is ordinary work. This is the part that fails quietly.

The consolation: `VereinNr` is ASCII digits. A charset mistake corrupts display names and never identity — the roster stays *correct* while looking wrong.

---

## Orientation

| What | Why |
|---|---|
| `src/config.ts:135-137` | `baseUrl` is already `…/nuLigaAdminTTDE.woa`. **The CLI already signs into nuLiga admin** — this is not new access |
| `src/raster/ingest/scrape.ts:91-107` | Already launches Chromium with `acceptDownloads: true` and collects wish PDFs. The session you are extending |
| `webapp/src/lib/raster/pipeline.ts` | How the webapp calls CLI parsers (`rasterIngest.parseWishesPdf`). The bridge the roster parser crosses |
| `data/Tabellen__…20260715120301.csv` | The real export. 404 teams, 85 clubs, 43 groups |
| `specs/009-…/research.md` R-301 | The charset rule, verified both ways |

---

## Build order

### Stage 1 — Import (User Stories 1 + 2, both P1)

Not separable. An importer that mangles club names is not a working importer.

1. `src/raster/ingest/roster-csv.ts` — parse **bytes**, not a string. Strict UTF-8 → on failure ISO-8859-15 → refuse on mojibake markers.
2. `RasterTeamRoster` + `RasterRosterTeam`, upsert on `(rosterId, vereinNr, altersklasse, mannschaftNr)`.
3. Roster source type on the existing upload route.
4. Region/Saison verification (FR-005).

**Verify**: import the OWL export → 404 teams, 85 clubs, 43 groups. `Tischtennisverein Höxter` and `TTV Grün-Weiß Daseburg` intact. Re-import → nothing changes.

### Stage 2 — Collection (User Stories 3 + 4, both P2)

1. `src/raster/ingest/nuliga-export.ts` — Downloads page, select export + Meisterschaft + charset, submit, poll, download.
2. Write the CSV into `reports/raster/clicktt-downloads/` beside the wish PDFs.
3. `webapp/src/lib/raster/bundle.ts` — unzip, classify, **report what is missing**.

**Verify**: run the CLI → CSV lands beside the PDFs, no manual download. Zip and upload → both imported. Upload a zip with no CSV → told so, and nothing imported.

### Stage 3 — Matching (User Story 5, P2)

Resolve parsed club names against the roster; offer non-matches for review; leave unrostered scopes untouched.

### Stage 4 — Coverage (User Story 6, P3)

Roster teams with no parsed counterpart, and parsed teams absent from the roster.

---

## Verification against success criteria

| SC | How |
|---|---|
| SC-001 | Import the OWL export → 404 / 85 / 43 |
| SC-002 | Export the same Meisterschaft as ISO-8859-15 and UTF-8; import both; records identical |
| SC-003 | No club name contains `Ã` or `Â` after any import |
| SC-004 | Re-import unchanged → nothing changes, nothing duplicates |
| SC-005 | Rename a club between two exports → one identity across both |
| SC-006 | With a roster, an exact-name parse resolves with no review step |
| SC-007 | "Which teams are missing from my sources?" answerable in-app |
| SC-008 | A scope with no roster behaves exactly as before |
| SC-009 | Collect roster + wish PDFs and upload, downloading nothing by hand |
| SC-010 | An incomplete bundle is never imported silently |
| SC-011 | No click-TT credential is held by, or reaches, the webapp |

`validate.ps1` for the CLI half, `webapp/validate.ps1` for the webapp half — constitution Principle VI.

---

## Traps

- **Assuming ISO-8859-15 because it is the default.** It cannot fail. It will lie. (R-301)
- **Parsing a string instead of bytes.** Hand the parser a string and someone already chose the encoding, probably wrongly.
- **Writing a second parser in the webapp.** One format, two implementations, is the exact bug PR #10 fixed — `match_duration_minutes` written three times, one differently. Use the `pipeline.ts` bridge. (R-302)
- **Importing a bundle that is missing its CSV.** FR-019b: say so. Half-loading a scope while reporting success is the failure this feature exists to prevent.
- **Delete-and-recreate on re-import.** Upsert on the canonical key. Feature 008 is currently unwinding exactly that pattern for wishes; do not plant a fresh one.
- **Treating `vereinNr` as a number.** It is an identifier. Integers eat leading zeros.
- **Trusting the standings columns.** They are zero before a season and irrelevant after. Read past them. (FR-007)
- **Avoiding the CLI's zip writer.** It is needed: FR-017 says the CLI emits a bundle, and Node has no archive writer. An earlier draft dodged the dependency and left the admin zipping by hand — which contradicted the requirement. Principle I asks that dependencies be justified, not avoided at the requirement's expense. (R-303)
- **Believing this plan about the Downloads DOM.** R-306 is honest that the selectors are unverified. Expect one iteration against the real page.

---

## Out of scope

Downloading wish PDFs (the CLI already does); fuzzy club matching (Phase 12 / T079-T082 — this makes its target canonical, it does not replace it); wish parsing or conflict review (008); the guided flow (005); replacing `splitTeamName` (Q2, deferred); what a changed roster does to an existing input set (Q3, deferred).
