import { Prisma } from "../../../generated/prisma/client";

const SERIALIZABLE_RETRY_LIMIT = 3;

export async function withSerializableRetry<T>(run: () => Promise<T>) {
  let attempt = 0;
  while (attempt < SERIALIZABLE_RETRY_LIMIT) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }

      if (
        isSerializableConflict(error) &&
        attempt < SERIALIZABLE_RETRY_LIMIT - 1
      ) {
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unreachable serializable retry state");
}

function isSerializableConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code === "P2034";
  }

  return false;
}
