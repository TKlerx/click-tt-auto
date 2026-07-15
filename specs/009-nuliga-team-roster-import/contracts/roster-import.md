# Phase 1 Contracts: nuLiga Team Roster Import

**Feature**: `009-nuliga-team-roster-import` | **Date**: 2026-07-15

Three interfaces: a CLI command, a parser shared across both halves, and the webapp's upload and read surface.

---

## CLI contract

A command that collects a scope's season inputs into one directory.

| Aspect | Contract |
|---|---|
| Auth | Existing `.env` credentials (`CLICK_TT_USERNAME`, `CLICK_TT_PASSWORD`), existing session. **No new secret** |
| Base URL | `config.baseUrl`, already `…/nuLigaAdminTTDE.woa` — the admin app the CLI signs into today |
| Inputs | Meisterschaft (Bezirk + season), matching the form's own selector |
| Charset | **Selected, not defaulted** (FR-016). The CLI is at the dropdown; it should not guess later at what it can choose now |
| Output | The CSV written beside the wish PDFs in `reports/raster/clicktt-downloads/` |
| Waiting | Poll for the download link (~5s). On timeout: report what was awaited, **save nothing partial** (FR-015) |
| Failure | Nothing half-written. A truncated CSV a later run mistakes for complete is the hazard Principle IV warns about |

**Read-only toward click-TT.** Requesting an export generates a report; it does not modify league data. The webapp never authenticates (FR-018).

---

## Parser contract

`src/raster/ingest/roster-csv.ts` — one implementation, both halves (R-302).

**Input**: file bytes. **Not** a string — the charset decision belongs to the parser, and handing it a string means someone already decided, probably wrongly.

**Output**: the roster rows plus which charset was used.

### Charset rule

1. Attempt a **strict** UTF-8 decode.
2. On failure → ISO-8859-15.
3. If UTF-8 succeeds but the text contains mojibake markers (`Ã¼`, `Ã¶`, `Ã¤`, `Ã`, `Â`) → **refuse** (FR-012). The file was double-encoded upstream; importing it launders damage that predates us.

Verified both ways against the real export: the UTF-8 original sniffs `utf-8`; the same content as ISO-8859-15 sniffs `iso-8859-15`. It works because `ö` in ISO-8859-15 is the single byte `F6`, and `F6` followed by an ASCII letter is not valid UTF-8.

**Never assume ISO-8859-15** (FR-011). It cannot fail to decode, so assuming it converts a UTF-8 export into `TTV GrÃŒn-WeiÃ Daseburg` and reports success.

### Shape

- Delimiter `;`
- Header row required
- Required columns: `Region`, `Saison`, `Liga`, `Gruppe`, `VereinNr`, `VereinName`, `Altersklasse`, `MannschaftNr`
- Standings columns read past, not returned (FR-007)
- A file missing the required columns is **not this export** → reject naming what was expected (FR-006)

---

## API

### Changed: source upload gains a bundle path

`POST /api/raster/sources/upload` — existing endpoint, existing auth.

| Upload | Behaviour |
|---|---|
| A bare Tabellen CSV | Imported as a roster source. **Identical to pre-bundle behaviour** (FR-019d) |
| A zip of CSV + wish PDFs | Each file imported as its own source type (FR-019a) |
| A zip with no CSV | Report the roster is missing. **Do not import only the PDFs** (FR-019b) |
| A zip with no wish PDFs | Report them missing. Do not import only the roster (FR-019b) |
| A zip with unrecognised files | Report them as unrecognised, not ignored (FR-019c) |

**FR-019b is the load-bearing one.** Importing what is present and reporting success is how a scope ends up half-loaded with nobody aware — the same silent-success failure as the charset hazard, and the reason both are refusals rather than warnings.

### New: roster read

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/raster/roster?scope=&season=` | `GET` | The roster for a scope and season (FR-022) |
| `/api/raster/roster/coverage?scope=&season=` | `GET` | Roster teams with no parsed counterpart, and parsed teams absent from the roster (FR-040, FR-041) |

**Authorisation**: the `viewer` level, consistent with every other raster read. Importing is `scheduler` — the level feature 007 establishes for work, not `admin`.

---

## Matching contract

Consumed where parsed sources resolve club identity (FR-030, FR-031).

| Case | Behaviour |
|---|---|
| Parsed name matches a roster entry exactly | Resolves to that canonical club |
| No exact match | Offered for review against roster candidates. **Never silently creates a new identity** |
| No roster imported for the scope | Existing behaviour, unchanged (FR-032) |

**FR-032 is what keeps this additive.** It is why feature 008 can ship without this one — at the cost of a noisier review — and why nothing already working can regress.

This contract does **not** include fuzzy matching. Phase 12 (T079-T082 on 004) owns that, and should shrink once the target is a fixed known set of 404 teams rather than a second name-list. What changes is the target, not the technique.
