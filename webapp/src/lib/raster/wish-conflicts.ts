import { RasterWishOrigin } from "../../../generated/prisma/enums";

export type OriginatedConflict = { wish: { origin: string } };

/**
 * Splits open conflicts by what is actually at stake.
 *
 * A wish is MANUAL once an admin has set its value by hand, so an import that
 * differs from it is proposing to undo their work -- the case this feature
 * exists to stop. Any other wish holds a value that came from the source, so a
 * difference means the source itself moved, which is routine.
 *
 * Both still need a decision; only their urgency differs.
 */
export function partitionConflicts<TConflict extends OriginatedConflict>(
  conflicts: TConflict[],
) {
  return {
    overwrites: conflicts.filter(
      (conflict) => conflict.wish.origin === RasterWishOrigin.MANUAL,
    ),
    sourceChanged: conflicts.filter(
      (conflict) => conflict.wish.origin !== RasterWishOrigin.MANUAL,
    ),
  };
}
