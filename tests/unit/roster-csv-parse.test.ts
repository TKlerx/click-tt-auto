import { TextEncoder } from "node:util";
import { describe, expect, it } from "vitest";
import { parseRosterCsvBytes } from "../../src/raster/ingest/roster-csv.js";

const encode = (text: string) => new TextEncoder().encode(text);

describe("roster CSV parser", () => {
  it("ignores standings columns", () => {
    const parsed = parseRosterCsvBytes(
      encode(
        [
          "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr;Rang;Begegnungen;PunkteGewonnen",
          "OWL;2026/27;Liga;Gruppe;042;Club;Erwachsene;1;1;9;18"
        ].join("\n")
      )
    );

    expect(parsed.rows).toEqual([
      {
        region: "OWL",
        season: "2026/27",
        liga: "Liga",
        gruppe: "Gruppe",
        vereinNr: "042",
        vereinName: "Club",
        altersklasse: "Erwachsene",
        mannschaftNr: "1"
      }
    ]);
  });

  it("reads quoted cells without swallowing delimiters or escaped quotes", () => {
    const parsed = parseRosterCsvBytes(
      encode(
        [
          "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr",
          `OWL;2026/27;Liga;"Gruppe;A";042;"SC ""GW"" Paderborn";Erwachsene;1`
        ].join("\n")
      )
    );

    expect(parsed.rows[0]).toMatchObject({
      gruppe: "Gruppe;A",
      vereinName: 'SC "GW" Paderborn'
    });
  });

  it("treats an empty quoted cell as missing, not as a quote character", () => {
    expect(() =>
      parseRosterCsvBytes(
        encode(
          [
            "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr",
            `OWL;2026/27;Liga;Gruppe;042;"";Erwachsene;1`
          ].join("\n")
        )
      )
    ).toThrow(/Missing VereinName/);
  });

  it("rejects missing required columns by name", () => {
    expect(() =>
      parseRosterCsvBytes(encode("Region;Saison\nOWL;2026/27"))
    ).toThrow(/Liga, Gruppe, VereinNr, VereinName, Altersklasse, MannschaftNr/);
  });

  it("rejects empty, header-only, and truncated files", () => {
    const header =
      "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr";

    expect(() => parseRosterCsvBytes(encode(""))).toThrow(/empty file/);
    expect(() => parseRosterCsvBytes(encode(header))).toThrow(/only a header/);
    expect(() =>
      parseRosterCsvBytes(encode(`${header}\nOWL;2026/27;Liga`))
    ).toThrow(/Missing Gruppe/);
  });
});
