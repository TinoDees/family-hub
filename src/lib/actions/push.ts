"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Save (or re-point) a push subscription for the signed-in user.
 * Admin client because an endpoint can move between accounts on a shared
 * browser — the upsert must be able to overwrite the old owner's row.
 * user_id always comes from the session, never from the caller.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!sub?.endpoint?.startsWith("https://") || !sub.p256dh || !sub.auth) {
    return { ok: false, error: "Invalid subscription" };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent?.slice(0, 200) ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint); // RLS: own rows only
  return { ok: true };
}
