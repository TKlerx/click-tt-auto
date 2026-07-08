import type { SeasonModel } from "../types.js";

export function groupComponents(model: SeasonModel): string[][] {
  return model.groups.map((group) => group.teamIds);
}
