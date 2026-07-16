/**
 * Best-effort server-side telemetry writers. Never throw — a failed log
 * must never break login/signup/webhooks. Service-role only tables.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type SecurityEventKind =
  | "login_failed"
  | "signup_failed"
  | "webhook_bad_signature"
  | "account_deleted"
  | "cron_unauthorised";

export async function logSecurityEvent(
  kind: SecurityEventKind,
  opts: {
    identifier?: string | null;
    ipHash?: string | null;
    path?: string | null;
    detail?: string | null;
  } = {}
): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createAdminClient();
    await admin.from("security_events").insert({
      kind,
      identifier: opts.identifier ?? null,
      ip_hash: opts.ipHash ?? null,
      path: opts.path ?? null,
      detail: opts.detail?.slice(0, 500) ?? null,
    });
  } catch {
    // swallow — telemetry must never break the caller
  }
}

export async function logAnalyticsEvent(
  event: string,
  opts: {
    sessionId?: string | null;
    path?: string | null;
    ipHash?: string | null;
  } = {}
): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      event,
      session_id: opts.sessionId ?? null,
      path: opts.path ?? null,
      ip_hash: opts.ipHash ?? null,
    });
  } catch {
    // swallow
  }
}
