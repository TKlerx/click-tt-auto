import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import { seasonModelSchema, type SeasonModelInput } from "@/lib/raster/schemas";
import { InputSetStatus } from "../../../generated/prisma/enums";

export async function listInputSets(district: string) {
  return prisma.rasterInputSet.findMany({
    where: rasterDistrictWhere(district),
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { wishes: true, fixedRasterzahlen: true, runs: true },
      },
    },
  });
}

export async function createInputSet(params: {
  district: string;
  name: string;
  createdById: string;
}) {
  return prisma.rasterInputSet.create({
    data: params,
  });
}

export async function getInputSet(id: string) {
  return prisma.rasterInputSet.findUnique({
    where: { id },
    include: {
      _count: {
        select: { wishes: true, fixedRasterzahlen: true },
      },
    },
  });
}

export async function validateInputSet(id: string) {
  const inputSet = await getInputSet(id);
  if (!inputSet) return null;

  const errors = [];
  if (inputSet._count.wishes === 0) {
    errors.push("At least one wish/team row is required.");
  }
  if (!inputSet.seasonModelJson) {
    errors.push("A structured season model is required.");
  } else {
    const parsed = seasonModelSchema.safeParse(
      JSON.parse(inputSet.seasonModelJson),
    );
    if (!parsed.success) {
      errors.push("The structured season model is invalid.");
    }
  }

  const status = errors.length ? InputSetStatus.DRAFT : InputSetStatus.READY;
  if (inputSet.status !== status) {
    await prisma.rasterInputSet.update({
      where: { id },
      data: { status },
    });
  }

  return { inputSet: { ...inputSet, status }, errors };
}

export async function updateSeasonModel(
  inputSetId: string,
  model: SeasonModelInput,
) {
  const parsed = seasonModelSchema.parse(model);
  return prisma.rasterInputSet.update({
    where: { id: inputSetId },
    data: {
      seasonModelJson: JSON.stringify(parsed),
      status: InputSetStatus.DRAFT,
    },
  });
}
