import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StepNav } from "@/components/raster/nav/step-nav";

const navigation = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);

describe("raster step routing", () => {
  it("step links preserve scope and season", () => {
    navigation.usePathname.mockReturnValue("/raster/review");
    navigation.useSearchParams.mockReturnValue(
      new URLSearchParams("scope=OWL&season=2026%2F27"),
    );

    const markup = renderToStaticMarkup(<StepNav />);

    expect(markup).toContain("/raster/import?scope=OWL&amp;season=2026%2F27");
    expect(markup).toContain("/raster/review?scope=OWL&amp;season=2026%2F27");
    expect(markup).toContain("/raster/run?scope=OWL&amp;season=2026%2F27");
    expect(markup).toContain("/raster/runs?scope=OWL&amp;season=2026%2F27");
  });
});
