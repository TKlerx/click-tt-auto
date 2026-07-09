# Raster PDF extraction expectations

This documents what `scripts/export-admin-pdf-teams.ts` should extract from the
available `Terminmeldung_gesamt_*.pdf` files.

The export CSV columns are:

```csv
sourcePdf,club,division,teamLabel,weekday,weekSlot,hall,startTime
```

- `club`: club name from the PDF section header, not the PDF filename.
- `division`: base team category, for example `Erwachsene`, `Damen`, `Jugend 19`.
- `teamLabel`: full team label, for example `Erwachsene II`, `Jugend 19 II`.
- `weekday`: normalized English weekday.
- `weekSlot`: `A` or `B` when the PDF row has a Spielwoche, otherwise empty.
- `hall`: numeric hall from `Halle <n>`.
- `startTime`: home match time.

Current expected row counts after duplicate removal:

| PDF | Rows |
| --- | ---: |
| `data/Terminmeldung_gesamt_bol.pdf` | 94 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | 65 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | 67 |
| total | 226 |

Current expected division counts:

| PDF | Division | Rows |
| --- | --- | ---: |
| `data/Terminmeldung_gesamt_bol.pdf` | Damen | 1 |
| `data/Terminmeldung_gesamt_bol.pdf` | Erwachsene | 64 |
| `data/Terminmeldung_gesamt_bol.pdf` | Jugend 13 | 3 |
| `data/Terminmeldung_gesamt_bol.pdf` | Jugend 15 | 10 |
| `data/Terminmeldung_gesamt_bol.pdf` | Jugend 19 | 16 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | Damen | 2 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | Erwachsene | 50 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | Jugend 13 | 4 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | Jugend 15 | 3 |
| `data/Terminmeldung_gesamt_1bl1.pdf` | Jugend 19 | 6 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Damen | 5 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Erwachsene | 41 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Jugend 13 | 5 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Jugend 15 | 5 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Jugend 19 | 10 |
| `data/Terminmeldung_gesamt_1bl2.pdf` | Mädchen 19 | 1 |

Example rows:

```csv
sourcePdf,club,division,teamLabel,weekday,weekSlot,hall,startTime
data/Terminmeldung_gesamt_bol.pdf,SV Rot-Weiß Alfen,Erwachsene,Erwachsene,friday,,1,20:00
data/Terminmeldung_gesamt_bol.pdf,SV Rot-Weiß Alfen,Erwachsene,Erwachsene II,wednesday,,1,20:00
data/Terminmeldung_gesamt_bol.pdf,SV Rot-Weiß Alfen,Jugend 19,Jugend 19,sunday,,1,10:00
data/Terminmeldung_gesamt_1bl1.pdf,TTSG Erder,Erwachsene,Erwachsene,saturday,B,1,16:00
data/Terminmeldung_gesamt_1bl1.pdf,TTSG Erder,Erwachsene,Erwachsene II,friday,A,1,20:00
data/Terminmeldung_gesamt_1bl2.pdf,SV Blau-Weiß Benhausen,Erwachsene,Erwachsene,friday,A,1,19:30
data/Terminmeldung_gesamt_1bl2.pdf,TTC Paderborn e.V.,Erwachsene,Erwachsene III,monday,B,1,19:30
```

No exported row should have a `club` value like `Terminmeldung_gesamt_bol`,
`Terminmeldung_gesamt_1bl1`, or `Terminmeldung_gesamt_1bl2`; that means the
parser fell back to the filename instead of finding the club section header.

The joined review file `reports/raster/public-admin-team-review.csv` should
cover every admin PDF row through one of these sources:

- `matched-public`: the team was found on the scraped public click-TT page.
- `matched-fixed-upper`: the team was found in the fixed upper Rasterzahlen CSV.
- `missing-public-and-fixed`: review failure; the team was in an admin PDF but
  neither source covered it.

`missing-admin-pdf-team` means the public scrape found a team that is not in the
currently available admin PDFs.
