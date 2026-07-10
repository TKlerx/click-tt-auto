import { z } from "zod";
import { runSettingsSchema, seasonModelSchema } from "@/lib/raster/schemas";

export const solverWeightsSchema = z.object({
  overUsage: z.coerce.number().int().nonnegative().default(10),
  overUsageFairness: z.coerce.number().int().nonnegative().default(1),
  wechsel: z.coerce.number().int().nonnegative().default(5),
  zeitgleich: z.coerce.number().int().nonnegative().default(5),
  sameClubDerbySt4: z.coerce.number().int().nonnegative().default(1000),
  spielwoche: z.coerce.number().int().nonnegative().default(0),
});

export const solverSeasonModelSchema = seasonModelSchema;

export const solverInputSchema = z.object({
  model: solverSeasonModelSchema,
  settings: runSettingsSchema.default({ timeLimitSeconds: 60, weights: {} }),
  weights: solverWeightsSchema.partial().default({}),
});

export const solverStatusSchema = z.enum([
  "OPTIMAL",
  "FEASIBLE",
  "INFEASIBLE",
  "MODEL_INVALID",
  "UNKNOWN",
]);

export const objectiveBreakdownSchema = z
  .object({
    overUsage: z.coerce.number().nonnegative().default(0),
    overUsageFairness: z.coerce.number().nonnegative().default(0),
    wechsel: z.coerce.number().nonnegative().default(0),
    zeitgleich: z.coerce.number().nonnegative().default(0),
    sameClubDerbySt4: z.coerce.number().nonnegative().default(0),
    spielwoche: z.coerce.number().nonnegative().default(0),
  })
  .partial()
  .default({});

export const solverMetadataSchema = z.object({
  solver: z.literal("ortools-cpsat"),
  status: solverStatusSchema,
  objective: z.number().nullable(),
  bestBound: z.number().nullable(),
  wallTimeSeconds: z.number().nonnegative(),
  objectiveBreakdown: objectiveBreakdownSchema,
});

export const solverAssignmentSchema = z.record(
  z.string().min(1),
  z.coerce.number().int().min(1),
);

export const solverOutputSchema = z.object({
  assignment: solverAssignmentSchema,
  metadata: solverMetadataSchema,
});

export type SolverWeightsInput = z.infer<typeof solverWeightsSchema>;
export type SolverInput = z.infer<typeof solverInputSchema>;
export type SolverMetadata = z.infer<typeof solverMetadataSchema>;
export type SolverOutput = z.infer<typeof solverOutputSchema>;
