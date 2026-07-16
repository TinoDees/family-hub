import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestIpHash } from "@/lib/hash";

export const runtime = "nodejs";

/**
 * First-party funnel tracking beacon (marketing/auth pages only).
 * Anonymised: no cookies, no raw IPs — a per-tab session id plus a salted
 * IP hash. Events are allowlisted; everything else is dropped silently.
 */
const ALLOWED_EVENTS = new Set(["page_view"]);
const ALLOWED_PATHS = new Set(["/", "/pricing", "/signup", "/login"]);

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      return new NextResponse(null, { status: 204 });

    const ua = req.headers.get("user-agent") ?? "";
    if (/bot|crawler|spider|preview|monitor|lighthouse/i.test(ua))
      return new NextResponse(null, { status: 204 });

    const body = (await req.json()) as Record<string, unknown>;
    const event = String(body.event ?? "");
    const path = String(body.path ?? "");
    if (!ALLOWED_EVENTS.has(event) || !ALLOWED_PATHS.has(path))
      return new NextResponse(null, { status: 204 });

    const str = (v: unknown, max = 200) =>
      typeof v === "string" && v ? v.slice(0, max) : null;

    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      event,
      path,
      session_id: str(body.sid, 64),
      referrer: str(body.ref, 300),
      utm_source: str(body.utm_source, 100),
      utm_medium: str(body.utm_medium, 100),
      utm_campaign: str(body.utm_campaign, 100),
      device: body.device === "mobile" ? "mobile" : "desktop",
      ip_hash: requestIpHash(req),
    });
  } catch {
    // never surface tracking errors to visitors
  }
  return new NextResponse(null, { status: 204 });
}
