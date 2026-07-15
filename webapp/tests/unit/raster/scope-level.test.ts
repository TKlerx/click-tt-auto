import { describe, expect, it } from "vitest";
import {
  getRasterScopeLevel,
  isSelectableRasterScope,
} from "@/lib/raster/scope-level";

describe("raster scope levels", () => {
  it("classifies Verband, Bezirk, and root by hierarchy position", () => {
    const root = { parent: null };
    const association = { parent: { code: "DE", parent: null } };
    const district = {
      parent: { code: "WTTV", parent: { code: "DE" } },
    };

    expect(getRasterScopeLevel(root)).toBe("root");
    expect(getRasterScopeLevel(association)).toBe("association");
    expect(getRasterScopeLevel(district)).toBe("bezirk");
  });

  it("allows only Verband and Bezirk in the Raster selector", () => {
    expect(isSelectableRasterScope({ parent: null })).toBe(false);
    expect(
      isSelectableRasterScope({ parent: { code: "DE", parent: null } }),
    ).toBe(true);
    expect(
      isSelectableRasterScope({
        parent: { code: "WTTV", parent: { code: "DE" } },
      }),
    ).toBe(true);
  });
});
