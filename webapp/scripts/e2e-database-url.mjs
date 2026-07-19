// Port 45432 sits below the Windows dynamic port range (49152+), where Hyper-V
// reserves blocks at boot. A published port inside that range can become
// unbindable after a reboot: see waitForPublishedPort in ensure-e2e-db.mjs.
export const DEFAULT_E2E_DATABASE_URL =
  "postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_e2e_test";

/**
 * The database the E2E suite provisions and RESETS.
 *
 * This deliberately does NOT fall back to DATABASE_URL. DATABASE_URL may point
 * at a real, even production, database, and the E2E setup runs
 * `prisma migrate reset --force` — which irreversibly destroys all data. A
 * previous `E2E_DATABASE_URL ?? DATABASE_URL ?? default` chain aimed exactly
 * that reset at a live LAN database; only Prisma's agent guard stopped it. So
 * E2E uses E2E_DATABASE_URL when explicitly set, otherwise the throwaway local
 * default, and never the ambient DATABASE_URL. Do not add DATABASE_URL back.
 */
export function resolveE2eDatabaseUrl(env = process.env) {
  return env.E2E_DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;
}
