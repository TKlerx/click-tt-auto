import { describe, expect, it } from "vitest";
import { parseMatchDetailHtml } from "../../src/match-detail.js";

function detailHtml(contentBetween = "", bemerkungen = ""): string {
  return `
    <html>
      <head>
        <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
      </head>
      <body>
        <div class="button-row">
          <button>Abbrechen</button>
          <button>&lt;&lt; Zurück</button>
          <button>Speichern</button>
        </div>
        ${contentBetween}
        <fieldset>
          <legend>Kontrolle</legend>
          <table>
            <caption>TSV Eintracht Belle</caption>
            <tr><td>MF</td><td>Alice</td><td></td></tr>
            <tr><td>1</td><td>A1</td><td>1.1</td></tr>
            <tr><td>2</td><td>A2</td><td>1.2</td></tr>
            <tr><td>3</td><td>A3</td><td>1.3</td></tr>
            <tr><td>4</td><td>A4</td><td>1.4</td></tr>
            <tr><td>5</td><td>A5</td><td>1.5</td></tr>
            <tr><td>6</td><td>A6</td><td>1.6</td></tr>
          </table>
          <table>
            <caption>TTC Paderborn</caption>
            <tr><td>MF</td><td>Bob</td><td></td></tr>
            <tr><td>1</td><td>B1</td><td>2.1</td></tr>
            <tr><td>2</td><td>B2</td><td>2.2</td></tr>
            <tr><td>3</td><td>B3</td><td>2.3</td></tr>
            <tr><td>4</td><td>B4</td><td>2.4</td></tr>
            <tr><td>5</td><td>B5</td><td>2.5</td></tr>
            <tr><td>6</td><td>B6</td><td>2.6</td></tr>
          </table>
        </fieldset>
        <div>Bemerkungen</div>
        <div>${bemerkungen}</div>
        <label for="approval">Spielbericht genehmigt</label>
        <input id="approval" type="checkbox" />
      </body>
    </html>
  `;
}

describe("parseMatchDetailHtml", () => {
  it("parses a normal match detail page", () => {
    const detail = parseMatchDetailHtml(detailHtml(), {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.matchFormat).toContain("Sechser-Paarkreuz-System");
    expect(detail.homeTeam.hasMF).toBe(true);
    expect(detail.homeTeam.playerCount).toBe(6);
    expect(detail.guestTeam.playerCount).toBe(6);
    expect(detail.hasErrorMessages).toBe(false);
  });

  it("stops when required detail page fields are missing", () => {
    expect(() =>
      parseMatchDetailHtml(
        `
          <html>
            <head><title>nuLigaAdmin</title></head>
            <body>
              <div>unexpected page</div>
            </body>
          </html>
        `,
        {
          homeTeam: "TSV Eintracht Belle",
          guestTeam: "TTC Paderborn"
        }
      )
    ).toThrow(/Expected detail page fields missing:/);
  });

  it("captures unexpected top content as an error", () => {
    const detail = parseMatchDetailHtml(detailHtml('<p class="error-msg">falsche Aufstellung</p>'), {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.hasErrorMessages).toBe(true);
    expect(detail.errorMessageText).toContain("falsche Aufstellung");
  });

  it("captures hinweise error blocks inside kontrolle before the lineup tables", () => {
    const html = `
      <html>
        <head>
          <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
        </head>
        <body>
          <div class="button-row">
            <button>Abbrechen</button>
            <button>&lt;&lt; ZurÃ¼ck</button>
            <button>Speichern</button>
          </div>
          <fieldset>
            <legend>Kontrolle</legend>
            <h2>Hinweis(e)</h2>
            <ul class="error-msg">
              <li><span class="error-msg">Falsche Einzelaufstellung laut Vorgabe der SpielstÃ¤rke!</span></li>
              <li><span class="error-msg">Falscher Einzeleinsatz! Der Einsatz der Einzelspieler entspricht nicht der Einzelaufstellung.</span></li>
            </ul>
            <table>
              <caption>TSV Eintracht Belle</caption>
              <tr><td>MF</td><td>Alice</td><td></td></tr>
              <tr><td>1</td><td>A1</td><td>1.1</td></tr>
              <tr><td>2</td><td>A2</td><td>1.2</td></tr>
              <tr><td>3</td><td>A3</td><td>1.3</td></tr>
              <tr><td>4</td><td>A4</td><td>1.4</td></tr>
              <tr><td>5</td><td>A5</td><td>1.5</td></tr>
              <tr><td>6</td><td>A6</td><td>1.6</td></tr>
            </table>
            <table>
              <caption>TTC Paderborn</caption>
              <tr><td>MF</td><td>Bob</td><td></td></tr>
              <tr><td>1</td><td>B1</td><td>2.1</td></tr>
              <tr><td>2</td><td>B2</td><td>2.2</td></tr>
              <tr><td>3</td><td>B3</td><td>2.3</td></tr>
              <tr><td>4</td><td>B4</td><td>2.4</td></tr>
              <tr><td>5</td><td>B5</td><td>2.5</td></tr>
              <tr><td>6</td><td>B6</td><td>2.6</td></tr>
            </table>
            <h2>Bemerkungen</h2>
            <p>keine Bemerkungen</p>
            <p><input id="approval" type="checkbox" />Spielbericht genehmigt</p>
          </fieldset>
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.hasErrorMessages).toBe(true);
    expect(detail.errorMessageText).toContain("Falsche Einzelaufstellung");
    expect(detail.errorMessageText).toContain("Falscher Einzeleinsatz");
  });

  it("captures non-empty hinweise text before the lineup tables even without error classes", () => {
    const html = `
      <html>
        <head>
          <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
        </head>
        <body>
          <div class="button-row">
            <button>Abbrechen</button>
            <button>&lt;&lt; ZurÃ¼ck</button>
            <button>Speichern</button>
          </div>
          <fieldset>
            <legend>Kontrolle</legend>
            <h2>Hinweis(e)</h2>
            <p>Die Einzelaufstellung der Gastmannschaft erfolgte nicht nach SpielstÃ¤rke.</p>
            <table>
              <caption>TSV Eintracht Belle</caption>
              <tr><td>MF</td><td>Alice</td><td></td></tr>
              <tr><td>1</td><td>A1</td><td>1.1</td></tr>
              <tr><td>2</td><td>A2</td><td>1.2</td></tr>
              <tr><td>3</td><td>A3</td><td>1.3</td></tr>
              <tr><td>4</td><td>A4</td><td>1.4</td></tr>
              <tr><td>5</td><td>A5</td><td>1.5</td></tr>
              <tr><td>6</td><td>A6</td><td>1.6</td></tr>
            </table>
            <table>
              <caption>TTC Paderborn</caption>
              <tr><td>MF</td><td>Bob</td><td></td></tr>
              <tr><td>1</td><td>B1</td><td>2.1</td></tr>
              <tr><td>2</td><td>B2</td><td>2.2</td></tr>
              <tr><td>3</td><td>B3</td><td>2.3</td></tr>
              <tr><td>4</td><td>B4</td><td>2.4</td></tr>
              <tr><td>5</td><td>B5</td><td>2.5</td></tr>
              <tr><td>6</td><td>B6</td><td>2.6</td></tr>
            </table>
            <h2>Bemerkungen</h2>
            <p>keine Bemerkungen</p>
            <p><input id="approval" type="checkbox" />Spielbericht genehmigt</p>
          </fieldset>
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.hasErrorMessages).toBe(true);
    expect(detail.errorMessageText).toContain("Die Einzelaufstellung der Gastmannschaft");
  });

  it("ignores acceptable notice text below the tables", () => {
    const html = `
      <html>
        <head>
          <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
        </head>
        <body>
          <div class="button-row">
            <button>Abbrechen</button>
            <button>&lt;&lt; Zurück</button>
            <button>Speichern</button>
          </div>
          <fieldset>
            <legend>Kontrolle</legend>
            <table>
              <caption>TSV Eintracht Belle</caption>
              <tr><td>MF</td><td>Alice</td><td></td></tr>
              <tr><td>1</td><td>A1</td><td>1.1</td></tr>
              <tr><td>2</td><td>A2</td><td>1.2</td></tr>
              <tr><td>3</td><td>A3</td><td>1.3</td></tr>
              <tr><td>4</td><td>A4</td><td>1.4</td></tr>
              <tr><td>5</td><td>A5</td><td>1.5</td></tr>
              <tr><td>6</td><td>A6</td><td>1.6</td></tr>
            </table>
            <table>
              <caption>TTC Paderborn</caption>
              <tr><td>MF</td><td>Bob</td><td></td></tr>
              <tr><td>1</td><td>B1</td><td>2.1</td></tr>
              <tr><td>2</td><td>B2</td><td>2.2</td></tr>
              <tr><td>3</td><td>B3</td><td>2.3</td></tr>
              <tr><td>4</td><td>B4</td><td>2.4</td></tr>
              <tr><td>5</td><td>B5</td><td>2.5</td></tr>
              <tr><td>6</td><td>B6</td><td>2.6</td></tr>
            </table>
          </fieldset>
          <h2>Bemerkungen</h2>
          <p>keine Bemerkungen</p>
          <p><input id="approval" type="checkbox" />Spielbericht genehmigt</p>
          <p class="error-msg">Hinweis(e) zur Genehmigung: verlegt, ursprünglicher Termin: Fr. 05.09.2025 20:00.</p>
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.hasErrorMessages).toBe(false);
  });

  it("supports missing MF rows when remarks contain the information", () => {
    const html = detailHtml("", "MF TSV Eintracht Belle: Alice, MF TTC Paderborn: Bob")
      .replace('<tr><td>MF</td><td>Alice</td><td></td></tr>', "")
      .replace('<tr><td>MF</td><td>Bob</td><td></td></tr>', "");

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.homeTeam.hasMF).toBe(false);
    expect(detail.guestTeam.hasMF).toBe(false);
    expect(detail.bemerkungen).toContain("MF TSV Eintracht Belle");
  });

  it("extracts the full bemerkungen section and accepts MF abbreviations there", () => {
    const html = `
      <html>
        <head>
          <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
        </head>
        <body>
          <div class="button-row">
            <button>Abbrechen</button>
            <button>&lt;&lt; Zurück</button>
            <button>Speichern</button>
          </div>
          <fieldset>
            <legend>Kontrolle</legend>
            <table>
              <caption>SC Wewer</caption>
              <tr><td>1</td><td>A1</td><td>1.1</td></tr>
              <tr><td>2</td><td>A2</td><td>1.2</td></tr>
              <tr><td>3</td><td>A3</td><td>1.3</td></tr>
              <tr><td>4</td><td>A4</td><td>1.4</td></tr>
              <tr><td>5</td><td>A5</td><td>1.5</td></tr>
              <tr><td>6</td><td>A6</td><td>1.6</td></tr>
            </table>
            <table>
              <caption>TuRa Elsen III</caption>
              <tr><td>1</td><td>B1</td><td>2.1</td></tr>
              <tr><td>2</td><td>B2</td><td>2.2</td></tr>
              <tr><td>3</td><td>B3</td><td>2.3</td></tr>
              <tr><td>4</td><td>B4</td><td>2.4</td></tr>
              <tr><td>5</td><td>B5</td><td>2.5</td></tr>
              <tr><td>6</td><td>B6</td><td>2.6</td></tr>
            </table>
            <h2>Allgemeines</h2>
            <p>Spielbeginn 19:30 Uhr - Spielende 22:30 Uhr<br />Zuschaueranzahl: 18</p>
            <h2>Bemerkungen</h2>
            <p>MF Wewer: Gundlach MF Elsen: Lüke</p>
            <p><input id="approval" type="checkbox" />Spielbericht genehmigt</p>
          </fieldset>
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "SC Wewer",
      guestTeam: "TuRa Elsen III"
    });

    expect(detail.bemerkungen).toContain("MF Wewer: Gundlach");
    expect(detail.bemerkungen).toContain("MF Elsen: Lüke");
  });

  it("parses tables with fewer than six players", () => {
    const html = detailHtml().replace("<tr><td>6</td><td>B6</td><td>2.6</td></tr>", "");
    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.guestTeam.playerCount).toBe(5);
  });

  it("parses a combined side-by-side lineup table without merging both teams", () => {
    const html = `
      <html>
        <head>
          <title>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</title>
        </head>
        <body>
          <div class="button-row">
            <button>Abbrechen</button>
            <button>&lt;&lt; Zurück</button>
            <button>Speichern</button>
          </div>
          <fieldset>
            <legend>Kontrolle</legend>
            <table>
              <tr><th>TSV Eintracht Belle</th><th></th><th></th><th>TTC Paderborn</th><th></th><th></th></tr>
              <tr><td>MF</td><td>Alice</td><td></td><td>MF</td><td>Bob</td><td></td></tr>
              <tr><td>1</td><td>A1</td><td>1.1</td><td>1</td><td>B1</td><td>2.1</td></tr>
              <tr><td>2</td><td>A2</td><td>1.2</td><td>2</td><td>B2</td><td>2.2</td></tr>
              <tr><td>3</td><td>A3</td><td>1.3</td><td>3</td><td>B3</td><td>2.3</td></tr>
              <tr><td>4</td><td>A4</td><td>1.4</td><td>4</td><td>B4</td><td>2.4</td></tr>
              <tr><td>5</td><td>A5</td><td>1.5</td><td>5</td><td>B5</td><td>2.5</td></tr>
              <tr><td>6</td><td>A6</td><td>1.6</td><td></td><td></td><td></td></tr>
            </table>
          </fieldset>
          <div>Bemerkungen</div>
          <div></div>
          <label for="approval">Spielbericht genehmigt</label>
          <input id="approval" type="checkbox" />
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.homeTeam.playerCount).toBe(6);
    expect(detail.guestTeam.playerCount).toBe(5);
    expect(detail.homeTeam.hasMF).toBe(true);
    expect(detail.guestTeam.hasMF).toBe(true);
  });

  it("parses nested lineup tables without confusing them with the score table", () => {
    const html = `
      <html>
        <head>
          <title>nuLigaAdmin</title>
        </head>
        <body>
          <form>
            <h1>Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)</h1>
            <input type="submit" value="Abbrechen" />
            <input type="submit" value="<< Zurück" />
            <input type="submit" value="Speichern" />
            <fieldset>
              <legend>Kontrolle</legend>
              <table width="100%">
                <tr>
                  <td width="49%">
                    <table class="result-set">
                      <tr><th>&nbsp;</th><th>Rang</th><th>Name, Vorname</th></tr>
                      <tr><td>MF</td><td>&nbsp;</td><td>Büsching, Alexander</td></tr>
                      <tr><td>1</td><td>1.1</td><td>Rayczik, Nils</td></tr>
                      <tr><td>2</td><td>1.2</td><td>Büsching, Alexander</td></tr>
                      <tr><td>3</td><td>1.3</td><td>Böhm, Markus</td></tr>
                      <tr><td>4</td><td>1.5</td><td>Klemenz, Philipp</td></tr>
                      <tr><td>5</td><td>1.6</td><td>Gehlhaar, Christian</td></tr>
                      <tr><td>6</td><td>2.1</td><td>Krähe, Bernd</td></tr>
                    </table>
                  </td>
                  <td>&nbsp;</td>
                  <td width="49%">
                    <table class="result-set">
                      <tr><th>&nbsp;</th><th>Rang</th><th>Name, Vorname</th></tr>
                      <tr><td>MF</td><td>&nbsp;</td><td>Dierkes, Martin</td></tr>
                      <tr><td>1</td><td>1.2</td><td>Thöne, Christiane</td></tr>
                      <tr><td>2</td><td>1.3</td><td>Werthmöller, Thomas</td></tr>
                      <tr><td>3</td><td>1.6</td><td>Gaukstern, Sascha</td></tr>
                      <tr><td>4</td><td>1.7</td><td>Dierkes, Martin</td></tr>
                      <tr><td>5</td><td>2.3</td><td>Strehle, Sören</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table class="result-set">
                <tr>
                  <th>&nbsp;</th>
                  <th colspan="2">TSV Eintracht Belle</th>
                  <th colspan="2">TTC Paderborn</th>
                  <th>1. Satz</th>
                  <th>2. Satz</th>
                  <th>3. Satz</th>
                  <th>4. Satz</th>
                  <th>5. Satz</th>
                  <th>Sätze</th>
                  <th>Spiele</th>
                </tr>
                <tr>
                  <td>5-6</td>
                  <td>Gehlhaar, Christian</td>
                  <td>&nbsp;</td>
                  <td>nicht anwesend</td>
                  <td>&nbsp;</td>
                  <td>11:0</td>
                  <td>11:0</td>
                  <td>11:0</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>3:0</td>
                  <td>1:0</td>
                </tr>
                <tr>
                  <td>6-6</td>
                  <td>Krähe, Bernd</td>
                  <td>&nbsp;</td>
                  <td>nicht anwesend</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              </table>
              <h2>Bemerkungen</h2>
              <p>keine Bemerkungen</p>
              <p><input id="approval" type="checkbox" />Spielbericht genehmigt</p>
            </fieldset>
          </form>
        </body>
      </html>
    `;

    const detail = parseMatchDetailHtml(html, {
      homeTeam: "TSV Eintracht Belle",
      guestTeam: "TTC Paderborn"
    });

    expect(detail.homeTeam.playerCount).toBe(6);
    expect(detail.guestTeam.playerCount).toBe(5);
    expect(detail.homeTeam.hasMF).toBe(true);
    expect(detail.guestTeam.hasMF).toBe(true);
  });
});
