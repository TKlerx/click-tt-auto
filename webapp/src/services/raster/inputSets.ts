import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import { seasonModelSchema, type SeasonModelInput } from "@/lib/raster/schemas";
import { InputSetStatus } from "../../../generated/prisma/enums";

type SeasonGroup = Record<string, unknown> & {
  id?: string;
  ref?: { league?: string; name?: string };
  size?: number;
  rasterMode?: "single" | "double";
};

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
    } else {
      for (const group of parsed.data.groups as SeasonGroup[]) {
        if (
          Number(group.size) === 6 &&
          group.rasterMode !== "single" &&
          group.rasterMode !== "double"
        ) {
          errors.push(
            `Six-team group ${groupLabel(group)} needs normal 6er or 6er Doppelrunde confirmation.`,
          );
        }
      }
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

export async function updateGroupRasterMode(
  inputSetId: string,
  groupId: string,
  rasterMode: "single" | "double",
) {
  const inputSet = await getInputSet(inputSetId);
  if (!inputSet?.seasonModelJson) return null;

  const model = seasonModelSchema.parse(JSON.parse(inputSet.seasonModelJson));
  let updated = false;
  model.groups = (model.groups as SeasonGroup[]).map((group) => {
    if (groupKey(group) !== groupId) return group;
    updated = true;
    return { ...group, rasterMode };
  });
  if (!updated) return null;

  return updateSeasonModel(inputSetId, model);
}

function groupKey(group: SeasonGroup) {
  return (
    group.id ??
    [group.ref?.league, group.ref?.name].filter(Boolean).join("::") ??
    ""
  );
}

function groupLabel(group: SeasonGroup) {
  return groupKey(group) || "(unnamed)";
}
