# Phase 0 Research: nuLiga Team Roster Import

**Feature**: `009-nuliga-team-roster-import` | **Date**: 2026-07-15

IDs numbered from R-301 to avoid collision with features 005 (R-001–R-008), 006 (R-101–R-106) and 007 (R-201–R-206).

---

## R-301: How is the character set decided?

**Decision**: Two mechanisms, because there are two paths in.

- **CLI-collected** (FR-016): select the character set explicitly in the Zeichensatz dropdown rather than accepting the ISO-8859-15 default. The encoding is then known, not guessed.
- **Hand-uploaded** (FR-010, FR-011): sniff — attempt a **strict** UTF-8 decode; on `UnicodeDecodeError`, decode ISO-8859-15.

**Rationale**: Sniffing works here, and it was verified in both directions against the real export rather than assumed:

| Input | Sniffed as |
|---|---|
| The real OWL export (UTF-8, 95 non-ASCII chars) | `utf-8` ✓ |
| The same content re-encoded as ISO-8859-15 | `iso-8859-15` ✓ |
| A pure-ASCII Latin file | `utf-8` — harmless, both decodings identical |

It works because of how German text sits in ISO-8859-15: `ö` is the single byte `F6`, and in club names it is followed by an ASCII letter (`Höxter` → `48 F6 78 …`). `F6` starts a 4-byte UTF-8 sequence and demands three continuation bytes in `80–BF`; an ASCII letter is not one. So a strict UTF-8 decode *fails*, which is the signal. With 95 non-ASCII characters in a 404-row file, an ISO-8859-15 export cannot plausibly decode as valid UTF-8 throughout.

**Why not sniff alone, and skip FR-016?** Because sniffing is inference and selecting is knowledge. The CLI is standing at the dropdown; asking it to guess afterwards at what it could simply have chosen is perverse. Sniffing exists for files the CLI did not fetch.

**What FR-012 ("cannot be established") actually covers**: the sniff is binary and always returns something, so the honest reading is narrower — a file that decodes as UTF-8 but *contains* mojibake (`Ã¼`, `Ã¶`, `Â`), meaning it was already double-encoded upstream. That is detectable and should be refused rather than imported, because the damage predates us and importing it launders it.

**Alternatives considered**:
- *Assume ISO-8859-15 (the nuLiga default)*: the failure this feature exists to avoid. It cannot fail to decode, so it turns a UTF-8 export into `TTV GrÃŒn-WeiÃ Daseburg` and reports success.
- *Require UTF-8 and reject the rest*: rejects the default the form actually produces, which punishes the normal case.
- *A charset-detection library*: a dependency to distinguish two known encodings by a rule that fits in five lines and was verified against the real data.

---

## R-302: Where do the CSV parse rules live, given both halves need them?

**Decision**: In the CLI (`src/raster/ingest/roster-csv.ts`), consumed by the webapp through the existing `webapp/src/lib/raster/pipeline.ts` bridge.

**Rationale**: Constitution Principle I forbids the web stack leaking into the CLI, and requires the CLI keep dependencies minimal — but says nothing against the webapp consuming CLI code. That direction is already the established pattern: `pipeline.ts` exposes `rasterIngest.parseWishesPdf`, and the webapp's wish import calls it. The roster parser is plain TypeScript over a string — no Next.js, no Prisma, no framework — so it crosses that bridge unchanged.

The alternative is two parsers for one format, which is exactly the shape of the bug PR #10 fixed: `match_duration_minutes` implemented three times, one of them differently. A CSV format with a charset rule, a delimiter, and an identity key is more than enough surface for two implementations to drift.

**Alternatives considered**:
- *Parse in the webapp, CLI just downloads*: simpler dependency graph, but the CLI cannot then validate what it collected, and FR-015's "save nothing partial" is weaker if the CLI cannot tell a good file from a truncated one.
- *A shared package*: correct in the abstract and disproportionate here — the repo has no workspace package structure for this, and `pipeline.ts` already solves it.

---

## R-303: What is a "bundle", and does the CLI need a zip writer?

**Decision**: The CLI **writes the zip**. The webapp reads it. Both halves take a zip dependency, each justified separately.

**Rationale**: FR-017 requires the CLI to emit the CSV and wish PDFs "as one bundle", and US3-AS4 says "it emits a single bundle". The originating intent was explicit: *"the final step would just be a zip bundling"* — the CLI's final step. A directory is not a bundle; it is the thing you make a bundle *from*.

**This entry previously decided the opposite**, and it was wrong. It had the CLI emit a directory for the admin to zip by hand, reasoning that Principle I's minimal-dependency rule bites hardest on the CLI. That inverted the priorities: the rule says dependencies must be "narrowly scoped and justified in a feature plan", not avoided at the cost of the requirement. Designing around a dependency the feature was asked for is not restraint, it is the plan overruling the spec.

**Justification under Principle I** — a pure-JS zip writer is:

- **Narrowly scoped**: one archive format, one code path, invoked once at the end of a collection run.
- **Precedented**: the same category as the pure-JS PDF reader and Excel I/O the constitution names as acceptable examples. Node's standard library has `zlib` (deflate) but no archive writer, so this cannot be done with what is already there.
- **Not a native binary or a framework**, which is what the rule actually guards against.

The webapp's zip *reader* (FR-019a) is justified separately and more easily: it sits inside `webapp/`, where the stack is governed separately from the CLI's minimal-dependency rule.

**Honest cost**: two zip dependencies rather than zero, in a repo that has kept the CLI lean. If a reviewer objects, the fallback is the admin zipping a directory — but that is a decision to take deliberately, not one to reach by default because a dependency felt uncomfortable.

**Alternatives considered**:
- *CLI emits a directory, admin zips it*: what this entry said before. Zero CLI dependencies, and it contradicts FR-017, US3-AS4, and the stated intent.
- *Webapp accepts a multi-file upload instead of a zip*: browsers can do it, but the bundle then has no single artifact to hand around, and FR-019b's "say what is missing" gets harder rather than easier.

---

## R-304: How is the roster stored?

**Decision**: Two tables — `RasterTeamRoster` (one import, scoped to scope + season) and `RasterRosterTeam` (one row per team). Keyed by `VereinNr` + `Altersklasse` + `MannschaftNr`, unique within a roster.

**Rationale**: FR-004 requires re-import to duplicate nothing, and FR-022 requires the roster be readable as "which teams exist in this scope and season". A roster row is not an input set's team — it is what click-TT says *should* exist, which the input set is then measured against (FR-040, FR-041). Storing it separately keeps that distinction, which is the whole point of the feature.

Uniqueness on `(rosterId, vereinNr, altersklasse, mannschaftNr)` is what makes FR-004 an upsert rather than a delete-and-recreate — and delete-and-recreate is the pattern feature 008 is currently unwinding for wishes. Not repeating it here is deliberate.

`VereinNr` is stored as text, not an integer. It is an identifier that happens to be numeric; nothing arithmetic is done to it, and leading zeros in another Verband would be silently eaten by an integer column.

**Alternatives considered**:
- *Fold the roster into the season model JSON*: no migration, and unqueryable — FR-040/FR-041 need to compare roster against parsed teams, which means joins.
- *One table, no roster header*: loses "which import, when, from which file", and FR-005's Region/Saison check has nowhere to record what it verified.

---

## R-305: What proves the import works?

**Decision**: The real OWL export, committed as a fixture, asserted against the numbers already verified from it.

**Rationale**: The spec's SC-001 states 404 teams / 85 clubs / 43 groups, and those numbers came from parsing the actual file rather than from a guess. A fixture makes that a test rather than a claim. It also carries the cases that matter and would be tedious to synthesise honestly: `SC GW Paderborn` (42706) with six adult teams, `TTV Grün-Weiß Daseburg` (42522) with the umlauts, and the exact `Altersklasse` vocabulary.

**Open**: the file is real club data (89KB, public standings). `data/hall-capacity.csv` and `data/upper-fixed.csv` are already tracked, so there is precedent — but committing it is the user's call, not the plan's. If it is not committed, the tests need a synthetic file, and SC-001's numbers become unverifiable.

**A second fixture is needed regardless**: an ISO-8859-15 version, to test R-301 both ways. It can be generated from the UTF-8 one at test time rather than committed.

---

## R-306: How does the CLI reach the Downloads page?

**Decision**: Reuse the existing authenticated session. Navigate to Downloads, select the export and Meisterschaft, choose the character set, submit, poll for the link, download.

**Rationale**: This was the spec's stated risk — "FR-014 assumes the credentials the CLI already uses reach nuLiga admin" — and it is not an assumption. `src/config.ts:135-137` defaults `baseUrl` to `https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa`, and `src/auth.ts:31` navigates straight there to sign in. **The CLI already authenticates against nuLiga admin**; match approval happens inside that app. The Downloads page is another page in a session that already exists.

The export is asynchronous (~5 seconds), so FR-015's requirement is a poll with a timeout, and a failure that saves nothing rather than a truncated file. Principle IV's "re-running should not cause double-approvals" generalises: a half-written CSV that a later run mistakes for complete is the same class of hazard.

**Unverified, and honestly so**: the Downloads page's DOM. The selectors cannot be written from a screenshot with confidence, and this plan does not pretend otherwise — the existing `auth.ts` uses resilient locators (`getByLabel(/benutzer|email|login|username/i)` with a fallback chain), and the same approach applies. Expect one iteration against the real page.

**Alternatives considered**:
- *A separate login for the admin area*: unnecessary — it is the same app.
- *Hit the export URL directly, skipping the form*: faster and brittle; the export is generated server-side and the link is not predictable.

---

## Resolved unknowns summary

| ID | Unknown | Decision |
|---|---|---|
| R-301 | Character set | CLI selects it; uploads are sniffed (strict UTF-8, else ISO-8859-15). Verified both ways |
| R-302 | Where the parser lives | CLI, consumed via the existing `pipeline.ts` bridge. One parser, not two |
| R-303 | Bundle format | CLI **writes** the zip; webapp reads it. Two dependencies, each justified |
| R-304 | Roster storage | Two tables, upsert on the canonical key. No delete-and-recreate |
| R-305 | Fixture | The real OWL export, if it may be committed |
| R-306 | Downloads navigation | Same session — `baseUrl` is already nuLiga admin. DOM selectors need one real iteration |

**No NEEDS CLARIFICATION remain.** Spec Q2 (does the roster replace `splitTeamName`?) and Q3 (roster changes under an existing input set) are deliberately still open — see data-model.md and the checklist.
