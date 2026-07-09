# Quickstart: Rasterzahl Wish Optimizer

**Feature**: [spec.md](spec.md)

Offline planner. No click-TT login needed for the core; scrape mode is optional.

## 1. Ingest → review

```bash
npm run raster -- ingest \
  --wishes "data/Terminmeldung_gesamt_bol.pdf" \
           "data/Terminmeldung_gesamt_1bl1.pdf" \
           "data/Terminmeldung_gesamt_1bl2.pdf" \
  --groups "data/Gruppen-und-Raster-2026.pdf" \
  --out reports/raster/model.json
```

Open `reports/raster/model.json` and fix every field the summary flagged as `review` — especially the free-text relational wishes (im Wechsel / zeitgleich) and any team whose group/hall/weekday was uncertain. This is the trust gate; nothing downstream is reliable until the model is confirmed.

## 2. Score the current (or a proposed) assignment

```bash
npm run raster -- score \
  --model reports/raster/model.json \
  --assignment reports/raster/current.json \
  --report reports/raster/score.json
```

Read the summary: broken wishes (with reasons), hall over-usages (club/hall/weekday/week), and any hard violations.

## 3. Optimize

```bash
npm run raster -- optimize \
  --model reports/raster/model.json \
  --start reports/raster/current.json \
  --out reports/raster/proposal.json \
  --report reports/raster/proposal-eval.json
```

The proposal is guaranteed no worse than `--start`, honors all fixed higher-league Rasterzahlen, keeps every group a valid `1..N` permutation, and keeps same-club derbies by Spieltag 4. Before/after objective is in the report.

## Validate the engine (developers)

```bash
npm test    # rulebook.test.ts reproduces the published 12er (and 10/14er) tables from research.md;
            # evaluate.test.ts matches the hand-computed reference score
pwsh -File ./validate.ps1
```

## Notes

- Rulebook (`Rasterzahlen_OWL_komplett.pdf`) is built-in and never re-parsed.
- Weights are tunable (`--weights specs/002-rasterzahl-wish-optimizer/weights.example.json`); default lets hall over-usage dominate.
- Absolute calendar constraints (even Kalenderwoche, specific Punktspieltage) are shown in the report but not optimized against in v1.
