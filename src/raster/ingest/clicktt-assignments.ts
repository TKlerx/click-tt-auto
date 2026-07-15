type Locator = {
  click(): Promise<void>;
  evaluateAll<T>(callback: (elements: Element[]) => T): Promise<T>;
  first(): {
    textContent(): Promise<string | null>;
  };
  nth(index: number): Locator;
  textContent(): Promise<string | null>;
};

type Page = {
  getByRole(role: string, options: { name: string; exact?: boolean }): Locator;
  getByText(text: string, options?: { exact?: boolean }): Locator;
  goto(
    url: string,
    options?: { waitUntil?: "domcontentloaded" }
  ): Promise<unknown>;
  locator(selector: string): Locator;
  url(): string;
  waitForLoadState(state: "domcontentloaded"): Promise<unknown>;
};

type IndexedGroupLink = {
  group: string;
  href: string;
  occurrence: number;
};

export interface TeamRasterAssignmentRow {
  league?: string;
  group: string;
  division?: string;
  rasterzahl: number;
  team: string;
  sourceUrl: string;
  wishUrl?: string;
}

export interface TeamRasterAssignmentScrapeOptions {
  groupNamePattern?: string;
}

function publicGroupUrl(leaguePageUrl: string, groupId: string): string {
  const url = new URL(leaguePageUrl);
  return `${url.origin}/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/groupPage?${url.searchParams.toString()}&group=${groupId}`;
}

async function parsePublicGroup(
  page: Page,
  group: string,
  href: string
): Promise<TeamRasterAssignmentRow[]> {
  await page.goto(href, { waitUntil: "domcontentloaded" });
  const league =
    (
      await page
        .locator("h1")
        .first()
        .textContent()
        .catch(() => null)
    )
      ?.replace(/\s+/g, " ")
      .trim()
      .replace(/^Bezirk\s+.+?\s+\d{4}\/\d{2}\s+/i, "")
      .replace(/\s+Tabelle.*$/i, "") || group;
  const rows = await page.locator("tr").evaluateAll((trs) =>
    trs.flatMap((tr) => {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim()
      );
      const rankIndex = cells.findIndex(
        (cell) => Number.isInteger(Number(cell)) && Number(cell) > 0
      );
      const rasterzahl = Number(cells[rankIndex]);
      const team = cells[rankIndex + 1];
      if (!Number.isInteger(rasterzahl) || rasterzahl < 1 || !team) return [];
      return [{ rasterzahl, team }];
    })
  );
  const division =
    league.match(
      /\b(Erwachsene|Damen|Herren|Jungen\s*\d+|Mädchen\s*\d+|Senior(?:en|innen)?\s*\d*)\b/i
    )?.[1] ?? undefined;
  return rows.map((row) => ({
    league,
    group: league,
    ...(division ? { division } : {}),
    ...row,
    sourceUrl: page.url()
  }));
}

export async function scrapePublicLeagueAssignments(
  page: Page,
  leaguePageUrl: string
): Promise<TeamRasterAssignmentRow[]> {
  await page.goto(leaguePageUrl, { waitUntil: "domcontentloaded" });
  const groups = (
    await page.locator("a").evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        group: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: anchor.getAttribute("href") ?? ""
      }))
    )
  ).flatMap((anchor) => {
    const href = new URL(anchor.href, leaguePageUrl).href;
    const groupId = href.match(/\/gruppe\/(\d+)\//)?.[1];
    return groupId ? [{ group: anchor.group, groupId }] : [];
  });

  const rows: TeamRasterAssignmentRow[] = [];
  for (const group of groups) {
    rows.push(
      ...(await parsePublicGroup(
        page,
        group.group,
        publicGroupUrl(leaguePageUrl, group.groupId)
      ))
    );
  }
  return rows;
}

export async function scrapeTeamRasterAssignments(
  page: Page,
  options: TeamRasterAssignmentScrapeOptions = {}
): Promise<TeamRasterAssignmentRow[]> {
  await page
    .getByText("Verstanden", { exact: true })
    .click()
    .catch(() => undefined);
  await page.getByText("SpielbetriebOrganisation", { exact: false }).click();
  await page.waitForLoadState("domcontentloaded");

  const groupPattern = new RegExp(
    options.groupNamePattern ??
      "^(?:WDM\\s+Bezirk\\s+Qualifikation|Bezirksoberliga|(?:\\d+\\.\\s*)?(?:Bezirksliga|Bezirksklasse|Kreisliga|Kreisklasse)|NRW-Liga|Verbandsliga|Landesliga)",
    "i"
  );
  const groups = (
    await page.locator("a").evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        group: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: anchor instanceof HTMLAnchorElement ? anchor.href : ""
      }))
    )
  )
    .filter(
      (link): link is Omit<IndexedGroupLink, "occurrence"> =>
        groupPattern.test(link.group) && Boolean(link.href)
    )
    .map((link, index, links) => ({
      ...link,
      occurrence: links
        .slice(0, index)
        .filter((other) => other.group === link.group).length
    }));

  const rows: TeamRasterAssignmentRow[] = [];
  const seenGroups = new Set<string>();
  for (const group of groups) {
    if (seenGroups.has(group.href)) continue;
    seenGroups.add(group.href);
    await page.getByText("SpielbetriebOrganisation", { exact: false }).click();
    await page.waitForLoadState("domcontentloaded");
    await page
      .getByRole("link", { name: group.group, exact: true })
      .nth(group.occurrence)
      .click();
    await page.waitForLoadState("domcontentloaded");

    const sourceUrl = page.url();
    const title =
      (
        await page
          .locator("h1")
          .first()
          .textContent()
          .catch(() => null)
      )
        ?.replace(/\s+/g, " ")
        .trim() || group.group;
    const groupWishUrl =
      (await page.locator("a").evaluateAll((anchors) => {
        const link = anchors.find((anchor) =>
          /Terminmeldungen\s*\(pdf\)/i.test(
            (anchor.textContent ?? "").replace(/\s+/g, " ").trim()
          )
        );
        return link instanceof HTMLAnchorElement ? link.href : undefined;
      })) ?? undefined;
    const assignments = await page.locator("tr").evaluateAll((trs) =>
      trs.flatMap((tr) => {
        const cells = Array.from(tr.querySelectorAll("th,td")).map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim()
        );
        const rasterzahl = Number(cells[0]);
        if (!Number.isInteger(rasterzahl) || rasterzahl < 1 || !cells[1])
          return [];

        const wishLink = Array.from(tr.querySelectorAll("a")).find((anchor) =>
          /Terminwünsche\s*\(pdf\)/i.test(
            (anchor.textContent ?? "").replace(/\s+/g, " ").trim()
          )
        );
        return [
          {
            rasterzahl,
            team: cells[1],
            rowWishUrl:
              wishLink instanceof HTMLAnchorElement ? wishLink.href : undefined
          }
        ];
      })
    );

    for (const assignment of assignments) {
      const wishUrl = groupWishUrl ?? assignment.rowWishUrl;
      rows.push({
        league: title,
        group: group.group,
        rasterzahl: assignment.rasterzahl,
        team: assignment.team,
        sourceUrl,
        ...(wishUrl ? { wishUrl } : {})
      });
    }
  }

  return rows;
}
