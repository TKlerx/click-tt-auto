import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  default: { readdir: vi.fn(() => Promise.resolve(["pins.pdf", "game-codes.pdf"])) },
}));

vi.mock("../../src/raster/ingest/pdf-text.js", () => ({
  extractPdfText: vi.fn((file: string) =>
    Promise.resolve(
      file.endsWith("game-codes.pdf")
        ? "Mo. 07.09.2026 19:30 TTC Paderborn III SC Borchen III TCDRYTRQY3LY"
        : [
            "Mo. 07.09.2026 19:30 TTC Paderborn III SC Borchen III 9359",
            "Do. 17.09.2026 19:30 SC Concordia Scharmede II TTC Paderborn III 7425",
          ].join("\n")
    )
  ),
}));

import { formatSpondCodeBlock, parseGameCodeDirectory, upsertSpondCodeBlock } from "../../src/spond/codes.js";

describe("Spond game code PDFs", () => {
  it("merges all-game PINs with home-game codes", async () => {
    const entries = await parseGameCodeDirectory("unused");

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.date === "2026-09-07" && entry.team === "TTC Paderborn III")).toMatchObject({
      home: true,
      opponent: "SC Borchen III",
      pin: "9359",
      gameCode: "TCDRYTRQY3LY",
    });
    const away = entries.find((entry) => entry.date === "2026-09-17" && entry.team === "TTC Paderborn III");
    expect(away).toMatchObject({
      home: false,
      opponent: "SC Concordia Scharmede II",
      pin: "7425",
    });
    expect(away).not.toHaveProperty("gameCode");
  }, 20_000);

  it("replaces the existing Spond block", () => {
    const entry = {
      date: "2026-09-07",
      start: new Date(2026, 8, 7, 19, 30),
      team: "TTC Paderborn III",
      homeTeam: "TTC Paderborn III",
      guestTeam: "SC Borchen III",
      opponent: "SC Borchen III",
      home: true,
      pin: "9359",
      gameCode: "TCDRYTRQY3LY",
      url: "https://ttde-apps.liga.nu/nuliga/nuscore-tt2",
    };

    expect(upsertSpondCodeBlock("Bring shoes\n\n[nuScore]\nold\n[/nuScore]", entry)).toBe(`Bring shoes

${formatSpondCodeBlock(entry)}`);
  });
});
