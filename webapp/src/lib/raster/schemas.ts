import { z } from "zod";

export const rasterWeekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const nonEmptyString = z.string().trim().min(1);
const optionalText = z.string().trim().optional();

export const wishJsonSchema = z.object({
  clubId: nonEmptyString,
  clubName: nonEmptyString,
  teamLabel: optionalText,
  homeWeekday: rasterWeekdaySchema,
  hall: optionalText,
  startTime: optionalText,
  spielwochePref: optionalText,
  requestedRasterzahl: z
    .union([z.coerce.number().int().min(1), nonEmptyString])
    .optional(),
  notes: optionalText,
});

export const capacityCsvRowSchema = z.object({
  district: nonEmptyString,
  clubId: nonEmptyString,
  hall: nonEmptyString,
  weekday: rasterWeekdaySchema,
  capacity: z.coerce.number().int().min(0),
});

export const fixedRasterzahlSchema = z.object({
  clubId: nonEmptyString,
  teamLabel: nonEmptyString,
  rasterzahl: z.coerce.number().int().min(1),
  source: z.enum(["PDF", "MANUAL", "STRUCTURED"]),
});

export const seasonModelSchema = z
  .object({
    clubs: z.array(z.record(z.string(), z.unknown())),
    teams: z.array(z.record(z.string(), z.unknown())).min(1),
    groups: z.array(z.record(z.string(), z.unknown())).min(1),
    wishes: z.array(z.record(z.string(), z.unknown())).default([]),
    absoluteConstraints: z.array(z.record(z.string(), z.unknown())).default([]),
    warnings: z.array(z.unknown()).default([]),
  })
  .passthrough();

export const runSettingsSchema = z.object({
  timeLimitSeconds: z.coerce.number().int().positive().default(60),
  randomSeed: z.coerce.number().int().optional(),
  weights: z
    .object({
      hallExcess: z.coerce.number().int().nonnegative().optional(),
      hallExcessBeyondOne: z.coerce.number().int().nonnegative().optional(),
      clubFairness: z.coerce.number().int().nonnegative().optional(),
      sameClubDerbySt4: z.coerce.number().int().nonnegative().optional(),
    })
    .default({}),
});

export type RasterWeekdayInput = z.infer<typeof rasterWeekdaySchema>;
export type WishJsonInput = z.infer<typeof wishJsonSchema>;
export type CapacityCsvRowInput = z.infer<typeof capacityCsvRowSchema>;
export type FixedRasterzahlInput = z.infer<typeof fixedRasterzahlSchema>;
export type SeasonModelInput = z.infer<typeof seasonModelSchema>;
export type RunSettingsInput = z.infer<typeof runSettingsSchema>;
