import "server-only";

type Environment = Readonly<Record<string, string | undefined>>;

/** The cutover gate is deliberately opt-in and disabled for normal traffic. */
export function isMaintenanceMode(env: Environment = process.env): boolean {
  return env.MAINTENANCE_MODE === "1";
}
