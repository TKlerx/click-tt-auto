import { prisma } from "@/lib/db";

export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok" as const,
    };
  } catch {
    return {
      status: "error" as const,
      message: "Database health check failed",
    };
  }
}

export function getProcessHealth() {
  return {
    status: "ok" as const,
    uptimeSeconds: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
