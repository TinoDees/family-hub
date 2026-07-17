"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/household";
import { getPlatformAdmin } from "@/lib/admin";

/**
 * Server actions behind the device-aware "Set up your phone" flow
 * (/setup-device). Token logic mirrors share-tokens.ts but is idempotent:
 * an existing key is reused, never replaced, so re-running setup can't
 * silently break an already-working Shortcut.
 */

export async function ensureShareTokenForSetup(): Promise<{
  ok: boolean;
  shareUrl?: string;
  error?: string;
}> {
  const membership = await getMembership();
  if (!membership) return { ok: false, error: "No household yet" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: existing } = await supabase
    .from("share_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();

  let token = existing?.token as string | undefined;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    const { error } = await supabase.from("share_tokens").insert({
      household_id: membership.household_id,
      user_id: user.id,
      token,
      label: "iPhone",
    });
    if (error) return { ok: false, error: error.message };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "nestlyapp.co";
  return { ok: true, shareUrl: `https://${host}/api/share-in?token=${token}` };
}

/** Record that the user finished (or skipped) device setup. Upserts their row. */
export async function markDeviceSetup(
  platform: string,
  status: "completed" | "dismissed"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const now = new Date().toISOString();
  const { error } = await supabase.from("user_device_setup").upsert(
    {
      user_id: user.id,
      platform,
      ...(status === "completed" ? { completed_at: now } : { dismissed_at: now }),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Dashboard nudge dismiss — platform isn't known server-side. */
export async function dismissDeviceSetupNudge() {
  await markDeviceSetup("unknown", "dismissed");
}

/**
 * The master "Send to Nestly" Shortcut's iCloud link, set by the platform
 * admin at /admin/shortcut. Tolerant of both storage shapes: a bare JSON
 * string or an object { url }.
 */
export async function getIosShortcutUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "ios_shortcut_url")
    .maybeSingle();
  const v = data?.value as unknown;
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "url" in v) {
    const url = (v as { url?: unknown }).url;
    if (typeof url === "string") return url.trim() || null;
  }
  return null;
}

/**
 * Admin: save (or clear, when empty) the master Shortcut link.
 * Same pattern as nav.ts global scope: getPlatformAdmin guard, then the
 * service-role client writes to platform_settings (RLS allows only reads).
 */
export async function saveIosShortcutUrl(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  const url = String(formData.get("url") ?? "").trim();
  const service = createAdminClient();

  if (!url) {
    await service.from("platform_settings").delete().eq("key", "ios_shortcut_url");
  } else {
    if (!/^https:\/\//i.test(url))
      redirect(
        `/admin/shortcut?error=${encodeURIComponent("Please paste a full https:// link (from Share → Copy iCloud Link)")}`
      );
    const { error } = await service.from("platform_settings").upsert(
      { key: "ios_shortcut_url", value: url, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error)
      redirect(`/admin/shortcut?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/shortcut");
  revalidatePath("/setup-device");
  redirect("/admin/shortcut?saved=1");
}
