export type RasterScopeLevel = "association" | "bezirk" | "root" | "unknown";

export type RasterScopeLevelInput = {
  parent: { code: string; parent: { code: string } | null } | null;
};

export function getRasterScopeLevel(
  scope: RasterScopeLevelInput,
): RasterScopeLevel {
  if (!scope.parent) {
    return "root";
  }

  if (scope.parent.code === "DE") {
    return "association";
  }

  if (scope.parent.parent?.code === "DE") {
    return "bezirk";
  }

  return "unknown";
}

export function isSelectableRasterScope(scope: RasterScopeLevelInput) {
  const level = getRasterScopeLevel(scope);
  return level === "association" || level === "bezirk";
}
