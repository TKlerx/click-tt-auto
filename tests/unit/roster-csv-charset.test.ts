import { readFile } from "node:fs/promises";
import { TextDecoder, TextEncoder } from "node:util";
import { describe, expect, it } from "vitest";
import { parseRosterCsvBytes } from "../../src/raster/ingest/roster-csv.js";

const fixture =
  "data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv";

describe("roster CSV charset", () => {
  it("reads the real UTF-8 export", async () => {
    const parsed = parseRosterCsvBytes(await readFile(fixture));

    expect(parsed.charset).toBe("utf-8");
    expect(parsed.rows).toHaveLength(404);
    expect(parsed.rows.map((row) => row.vereinName)).toContain(
      "Tischtennisverein Höxter"
    );
    expect(parsed.rows.map((row) => row.vereinName)).toContain(
      "TTV Grün-Weiß Daseburg"
    );
  });

  it("reads an ISO-8859-15 export with identical rows", async () => {
    const utf8 = await readFile(fixture);
    const utf8Parsed = parseRosterCsvBytes(utf8);
    const iso = Buffer.from(new TextDecoder().decode(utf8), "latin1");
    const parsed = parseRosterCsvBytes(iso);

    expect(parsed.charset).toBe("iso-8859-15");
    expect(parsed.rows).toEqual(utf8Parsed.rows);
  });

  it("refuses a UTF-8 file that already contains mojibake", () => {
    const bytes = new TextEncoder().encode(
      [
        "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr",
        "Ostwestfalen/Lippe;2026/27;Liga;Gruppe;1;TTV GrÃ¼n-WeiÃŸ Daseburg;Erwachsene;1"
      ].join("\n")
    );

    expect(() => parseRosterCsvBytes(bytes)).toThrow(/mojibake/i);
  });
});
