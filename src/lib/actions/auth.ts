"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSecurityEvent, logAnalyticsEvent } from "@/lib/telemetry";
import { saltedHash, actionIpHash } from "@/lib/hash";

function safeNext(raw: FormDataEntryValue | null): string | null {
  const next = String(raw ?? "");
  // only allow same-site relative paths
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Record where a new account came from, using the first-touch
 * `nestly_attrib` cookie set by the Track beacon / tour page.
 * Best effort: must never break signup.
 */
async function recordSignupAttribution(userId: string | undefined) {
  try {
    if (!userId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const jar = await cookies();
    const raw = jar.get("nestly_attrib")?.value;
    if (!raw) return;
    const a = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const str = (v: unknown, max = 200) =>
      typeof v === "string" && v ? v.slice(0, max) : null;
    const admin = createAdminClient();
    await admin.from("signup_attributions").upsert({
      user_id: userId,
      utm_source: str(a.s, 100),
      utm_medium: str(a.m, 100),
      utm_campaign: str(a.c, 100),
      utm_content: str(a.co, 100),
      utm_term: str(a.t, 100),
      referrer: str(a.r, 300),
      landing_path: str(a.l, 100),
    });
  } catch {
    // swallow — attribution must never break signup
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  let identifier = String(formData.get("email") ?? "").trim();
  // child accounts sign in with a plain username
  if (identifier && !identifier.includes("@")) {
    identifier = `${identifier.toLowerCase()}@kids.nestly.internal`;
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: identifier,
    password: String(formData.get("password") ?? ""),
  });
  if (error) {
    await logSecurityEvent("login_failed", {
      identifier: identifier ? saltedHash(identifier) : null,
      ipHash: await actionIpHash(),
      path: "/login",
      detail: error.message,
    });
    redirect(
      `/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
    );
  }
  await logAnalyticsEvent("login", { path: "/login", ipHash: await actionIpHash() });
  revalidatePath("/", "layout");
  redirect(next ?? "/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") ?? "");
  const { data, error } = await supabase.auth.signUp({
    email,
    password: String(formData.get("password") ?? ""),
    options: {
      data: { display_name: String(formData.get("name") ?? "") },
    },
  });
  if (error) {
    await logSecurityEvent("signup_failed", {
      identifier: email ? saltedHash(email) : null,
      ipHash: await actionIpHash(),
      path: "/signup",
      detail: error.message,
    });
    if (/already registered/i.test(error.message))
      redirect(
        `/login?message=${encodeURIComponent(
          "You already have a Nestly account with this email (maybe from a trip invite). Sign in — you can create your own family from there."
        )}&next=${encodeURIComponent("/onboarding")}`
      );
    redirect(
      `/signup?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
    );
  }
  await logAnalyticsEvent("signup_completed", {
    path: "/signup",
    ipHash: await actionIpHash(),
  });
  await recordSignupAttribution(data.user?.id);
  if (!data.session)
    redirect("/login?message=Check+your+email+to+confirm+your+account");
  revalidatePath("/", "layout");
  redirect(next ?? "/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
