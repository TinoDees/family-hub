import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout route handler — a Server Component can't clear auth cookies, so the
 * (app) layout's overnight gate bounces here (Tracey pattern).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason");
  const message =
    reason === "overnight"
      ? "Signed out overnight for a fresh start — please sign in again"
      : "Signed out";
  return NextResponse.redirect(
    new URL(`/login?message=${encodeURIComponent(message)}`, request.url)
  );
}
