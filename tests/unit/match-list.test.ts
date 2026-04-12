import { describe, expect, it } from "vitest";
import { parseMatchListHtml } from "../../src/match-list.js";

const html = `
  <html>
    <body>
      <div>283 gefunden | Seite 1 / 3</div>
      <table>
        <tr><td colspan="8"><b>Bezirksoberliga Erwachsene</b></td></tr>
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
          <td></td>
          <td>Fr.</td>
          <td>03.10.2025 20:00</td>
          <td>1</td>
          <td>TuRa Elsen III</td>
          <td>TTS Detmold</td>
          <td>:</td>
          <td>nicht angetreten</td>
          <td>NA</td>
          <td>2:0</td>
          <td></td>
          <td><a href="/match/na">erfassen</a></td>
        </tr>
        <tr>
          <td>11.10.2025 20:00</td>
          <td>TTS Detmold</td>
          <td>SV Heide Paderborn</td>
          <td>9:7</td>
          <td>2:0</td>
          <td>abgeschlossen</td>
          <td><img src="/icons/check.gif" /></td>
          <td><a href="/match/3">erfassen</a></td>
        </tr>
        <tr>
          <td></td>
          <td>Fr.</td>
          <td>12.09.2025 19:30</td>
          <td>1</td>
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
    expect(parsed.allMatches).toHaveLength(5);
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

  it("recognizes approved rows from a bare check icon source", () => {
    const parsed = parseMatchListHtml(html);
    const approvedRow = parsed.allMatches.find((entry) => entry.erfassenUrl === "/match/3");

    expect(approvedRow?.isApproved).toBe(true);
  });

  it("ignores weekday and running-number columns before the team names", () => {
    const parsed = parseMatchListHtml(html);
    const weekdayRow = parsed.allMatches.find((entry) => entry.erfassenUrl === "/match/4");

    expect(weekdayRow?.homeTeam).toBe("DJK Blau-Weiss Avenwedde");
    expect(weekdayRow?.guestTeam).toBe("TTC Mennighüffen");
    expect(weekdayRow?.erfassenUrl).toBe("/match/4");
  });

  it("does not mistake the NA info column for the guest team", () => {
    const parsed = parseMatchListHtml(html);
    const naRow = parsed.allMatches.find((entry) => entry.erfassenUrl === "/match/na");

    expect(naRow?.homeTeam).toBe("TuRa Elsen III");
    expect(naRow?.guestTeam).toBe("TTS Detmold");
  });
});
