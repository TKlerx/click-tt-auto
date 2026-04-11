import { describe, expect, it } from "vitest";
import { parseMatchListHtml } from "../../src/match-list.js";

const html = `
  <html>
    <body>
      <div>283 gefunden | Seite 1 / 3</div>
      <table>
        <tr><th colspan="8">Bezirksoberliga Erwachsene</th></tr>
        <tr>
          <td>10.10.2025 20:00</td>
          <td>TSV Eintracht Belle</td>
          <td>TTC Paderborn</td>
          <td>9:0</td>
          <td>2:0</td>
          <td>abgeschlossen</td>
          <td><a href="/match/1">erfassen</a></td>
        </tr>
        <tr>
          <td>03.10.2025 20:00</td>
          <td>TuRa Elsen III</td>
          <td>TTS Detmold</td>
          <td>9:0</td>
          <td>2:0</td>
          <td>nicht angetreten</td>
          <td><a href="/match/2">erfassen</a></td>
        </tr>
        <tr>
          <td>11.10.2025 20:00</td>
          <td>TTS Detmold</td>
          <td>SV Heide Paderborn</td>
          <td>9:7</td>
          <td>2:0</td>
          <td>abgeschlossen</td>
          <td><img alt="genehmigt" /></td>
          <td><a href="/match/3">erfassen</a></td>
        </tr>
        <tr>
          <td>Fr.</td>
          <td>1</td>
          <td>12.09.2025 19:30</td>
          <td>DJK Blau-Weiss Avenwedde</td>
          <td>TTC Mennighüffen</td>
          <td>9:3</td>
          <td>2:0</td>
          <td>abgeschlossen</td>
          <td><a href="/match/4">erfassen</a></td>
        </tr>
      </table>
    </body>
  </html>
`;

describe("parseMatchListHtml", () => {
  it("keeps only abgeschlossen and not-yet-approved matches", () => {
    const parsed = parseMatchListHtml(html);
    expect(parsed.allMatches).toHaveLength(4);
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.matches[0]?.homeTeam).toBe("TSV Eintracht Belle");
  });

  it("extracts pagination information", () => {
    const parsed = parseMatchListHtml(html);
    expect(parsed.pagination.currentPage).toBe(1);
    expect(parsed.pagination.totalPages).toBe(3);
    expect(parsed.totalMatches).toBe(283);
  });

  it("captures the group header for rows", () => {
    const parsed = parseMatchListHtml(html);
    expect(parsed.matches[0]?.group).toBe("Bezirksoberliga Erwachsene");
  });

  it("ignores weekday and running-number columns before the team names", () => {
    const parsed = parseMatchListHtml(html);
    expect(parsed.matches[1]?.homeTeam).toBe("DJK Blau-Weiss Avenwedde");
    expect(parsed.matches[1]?.guestTeam).toBe("TTC Mennighüffen");
    expect(parsed.matches[1]?.erfassenUrl).toBe("/match/4");
  });
});
