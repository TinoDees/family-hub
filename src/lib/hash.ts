import { createHash } from "crypto";
import { headers } from "next/headers";

/**
 * Salted one-way hash for analytics/security identifiers (IPs, emails).
 * We never store the raw value — only enough to correlate repeat offenders.
 */
export function saltedHash(value: string): string {
  const salt =
    process.env.ANALYTICS_SALT ?? process.env.CRON_SECRET ?? "nestly-local";
  return createHash("sha256")
    .update(`${salt}:${value.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 24);
}

/** IP hash from a Route Handler request. */
export function requestIpHash(req: Request): string | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");
  return ip ? saltedHash(ip) : null;
}

/** IP hash from a Server Action (via next/headers). */
export async function actionIpHash(): Promise<string | null> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    return ip ? saltedHash(ip) : null;
  } catch {
    return null;
  }
}
