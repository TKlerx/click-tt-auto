import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CoverageDetail } from "@/components/raster/coverage/coverage-detail";
import type { CoverageRecord } from "@/lib/raster/coverage";

describe("coverage detail", () => {
  it("collapses and groups coverage gaps", () => {
    const coverage: CoverageRecord = {
      complete: false,
      spannedScopes: ["scope-a"],
      spannedAll: false,
      scopesWithoutInputSet: [],
      excludedGroups: ["group-a", "group-b"],
      wishGaps: [{ teamId: "team-a", missing: ["wish", "gym"] }],
      capacityGaps: [],
      upperLeague: {
        importPresent: true,
        matched: [],
        unmatched: [{ clubId: "club-a", label: "Erwachsene" }],
        excludedNoHall: [{ clubId: "club-b", label: "Damen" }],
        invalidRasterzahl: [],
      },
    };

    const detail = CoverageDetail({ coverageJson: JSON.stringify(coverage) });
    const details = collectElements(detail, "details")[0];
    const text = collectText(detail).join(" ");

    expect(details?.props.open).toBeUndefined();
    expect(text).toMatch(/Coverage gaps\s+\(\s*5\s*\)/);
    expect(text).toMatch(/Excluded groups\s+\(\s*2\s*\)/);
    expect(text).toMatch(/Wish gaps\s+\(\s*1\s*\)/);
    expect(text).toMatch(/Upper-league unmatched\s+\(\s*1\s*\)/);
    expect(text).toMatch(/Upper-league missing hall\/day\s+\(\s*1\s*\)/);
  });
});

function collectElements(
  node: ReactNode,
  type: string,
): Array<ReactElement<{ open?: boolean; children?: ReactNode }>> {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  const matches =
    element.type === type
      ? [element as ReactElement<{ open?: boolean; children?: ReactNode }>]
      : [];
  return [...matches, ...collectElements(element.props.children, type)];
}

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => ReactNode;
      return collectText(render(element.props));
    }
    return collectText(element.props.children);
  }
  return [];
}
