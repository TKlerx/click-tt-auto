import { describe, expect, it } from "vitest";
import {
  aliasReviewActions,
  buildAliasReviewPayload,
} from "@/components/raster/capacity/club-alias-review";

describe("source identity alias review UI contract", () => {
  it("builds accept, override, and create payloads for club and team candidates", () => {
    expect(
      buildAliasReviewPayload(
        {
          kind: "TEAM",
          rawIdentity: "Herren 1",
          suggestedIdentity: "team-herren-i",
          suggestedName: "Herren I",
        },
        "accept",
      ),
    ).toEqual({
      sourceClubId: "Herren 1",
      targetClubId: "team-herren-i",
      canonicalName: "Herren I",
      kind: "TEAM",
      createNewIdentity: false,
    });
    expect(
      buildAliasReviewPayload(
        { kind: "CLUB", rawIdentity: "SC Neu", suggestedIdentity: undefined },
        "create",
        { id: "sc-neu", name: "SC Neu" },
      ),
    ).toEqual({
      sourceClubId: "SC Neu",
      targetClubId: "sc-neu",
      canonicalName: "SC Neu",
      kind: "CLUB",
      createNewIdentity: true,
    });
    expect(aliasReviewActions).toEqual(["accept", "override", "create"]);
  });
});
