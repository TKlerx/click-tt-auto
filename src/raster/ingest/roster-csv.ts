import { TextDecoder } from "node:util";

export const rosterCharsets = ["utf-8", "iso-8859-15"] as const;
export type RosterCharset = (typeof rosterCharsets)[number];

export type RosterCsvRow = {
  region: string;
  season: string;
  liga: string;
  gruppe: string;
  vereinNr: string;
  vereinName: string;
  altersklasse: string;
  mannschaftNr: string;
};

export type RosterCsvParseResult = {
  charset: RosterCharset;
  rows: RosterCsvRow[];
};

const requiredColumns = [
  "Region",
  "Saison",
  "Liga",
  "Gruppe",
  "VereinNr",
  "VereinName",
  "Altersklasse",
  "MannschaftNr"
] as const;

const mojibakeMarkers = [
  "Ã¼",
  "Ã¶",
  "Ã¤",
  "ÃŸ",
  "ÃƒÂ¼",
  "ÃƒÂ¶",
  "ÃƒÂ¤",
  "Ãƒ",
  "Ã‚"
];

export function parseRosterCsvBytes(bytes: Uint8Array): RosterCsvParseResult {
  const { text, charset } = decodeRosterCsv(bytes);
  const rows = parseDelimitedRows(text);
  if (rows.length === 0) {
    throw new Error("Expected Tabellen export header, got an empty file.");
  }

  const header = rows[0] ?? [];
  const columns = new Map(header.map((column, index) => [column, index]));
  const missing = requiredColumns.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(
      `Expected Tabellen export columns ${requiredColumns.join(", ")}; missing ${missing.join(", ")}.`
    );
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell));
  if (dataRows.length === 0) {
    throw new Error("Expected Tabellen export rows, got only a header.");
  }

  return {
    charset,
    rows: dataRows.map((row, index) => {
      const line = index + 2;
      const value = (column: (typeof requiredColumns)[number]) => {
        const cell = row[columns.get(column)!]?.trim() ?? "";
        if (!cell)
          throw new Error(`Missing ${column} in Tabellen row ${line}.`);
        return cell;
      };
      return {
        region: value("Region"),
        season: value("Saison"),
        liga: value("Liga"),
        gruppe: value("Gruppe"),
        vereinNr: value("VereinNr"),
        vereinName: value("VereinName"),
        altersklasse: value("Altersklasse"),
        mannschaftNr: value("MannschaftNr")
      };
    })
  };
}

function decodeRosterCsv(bytes: Uint8Array): {
  text: string;
  charset: RosterCharset;
} {
  const text = decodeUtf8OrNull(bytes);
  if (text === null) {
    // ISO-8859-15 cannot fail to decode, so it is only ever the fallback.
    return {
      text: new TextDecoder("iso-8859-15").decode(bytes),
      charset: "iso-8859-15"
    };
  }
  if (mojibakeMarkers.some((marker) => text.includes(marker))) {
    throw new Error(
      "Refusing Tabellen export with mojibake markers; re-export it as UTF-8 or ISO-8859-15."
    );
  }
  return { text, charset: "utf-8" };
}

function decodeUtf8OrNull(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseDelimitedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
