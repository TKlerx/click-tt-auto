export type WishIdentityInput = {
  id: string;
  clubId: string;
  teamLabel?: string | null;
};

export type ImportedWishIdentity = {
  clubId: string;
  teamLabel?: string | null;
};

export function findMatchingWish<TWish extends WishIdentityInput>(
  imported: ImportedWishIdentity,
  wishes: TWish[],
) {
  const importedKey = wishIdentityKey(imported.clubId, imported.teamLabel);
  return (
    wishes.find(
      (wish) => wishIdentityKey(wish.clubId, wish.teamLabel) === importedKey,
    ) ?? null
  );
}

export function wishIdentityKey(
  clubId: string | undefined,
  teamLabel: string | null | undefined,
) {
  return `${clubId ?? ""}|${normalizeTeamLabel(teamLabel)}`;
}

export function normalizeTeamLabel(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
