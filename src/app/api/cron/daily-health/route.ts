import { NextResponse } from "next/server";
import { runHealthCheck } from "@/lib/health";
import { logSecurityEvent } from "@/lib/telemetry";
import { requestIpHash } from "@/lib/hash";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily platform health check (7:00 am Sydney = 21:00 UTC, see vercel.json).
 * Secured by Vercel cron's Authorization: Bearer CRON_SECRET header.
 * Unauthorised hits are themselves logged as a security signal.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    await logSecurityEvent("cron_unauthorised", {
      path: "/api/cron/daily-health",
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "No service key" }, { status: 500 });
  }

  const { report, emailed, emailReason } = await runHealthCheck("cron");
  return NextResponse.json({
    ok: true,
    status: report.status,
    emailed,
    ...(emailReason ? { emailReason } : {}),
  });
}
