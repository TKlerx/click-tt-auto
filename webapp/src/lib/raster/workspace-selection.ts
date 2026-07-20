export type RasterWorkspaceOption = {
  id: string;
  name: string;
  scopeId: string;
  season: string;
};

export function resolveWorkspaceSelection<T extends RasterWorkspaceOption>(
  workspaces: T[],
  requestedId?: string | null,
) {
  const requested = requestedId
    ? workspaces.find((workspace) => workspace.id === requestedId)
    : null;
  const selected =
    requested ?? (workspaces.length === 1 ? workspaces[0] : null);
  return {
    selected,
    showSelector: workspaces.length > 1,
    staleRequested: Boolean(requestedId && !requested),
  };
}
