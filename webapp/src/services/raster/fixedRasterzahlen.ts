import { prisma } from "@/lib/db";
import type { FixedRasterzahlInput } from "@/lib/raster/schemas";
import { FixedRasterzahlSource } from "../../../generated/prisma/enums";

export async function replaceFixedRasterzahlen(
  inputSetId: string,
  rows: FixedRasterzahlInput[],
) {
  await prisma.rasterFixedRasterzahl.deleteMany({ where: { inputSetId } });
  if (!rows.length) return { count: 0 };

  return prisma.rasterFixedRasterzahl.createMany({
    data: rows.map((row) => ({
      inputSetId,
      clubId: row.clubId,
      teamLabel: row.teamLabel,
      rasterzahl: row.rasterzahl,
      source: FixedRasterzahlSource[row.source],
    })),
  });
}
