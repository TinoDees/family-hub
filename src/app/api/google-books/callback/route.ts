import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/module-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  googleBooksConfigured,
  exchangeCode,
  emailFromIdToken,
  syncMemberGoogleBooks,
  type GoogleAccount,
} from "@/lib/google-books";

/**
 * Google sends the member back here after the consent screen.
 * We verify the CSRF state, swap the code for tokens, store the connection
 * (owner-only RLS row) and do the first shelf sync straight away.
 */
export async function GET(request: NextRequest) {
  const { membership, userId } = await requireModule("library", "view");
  if (!googleBooksConfigured()) redirect("/library?google=unconfigured");

  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const expectedState = store.get("gb_oauth_state")?.value;
  store.delete("gb_oauth_state");

  if (params.get("error")) redirect("/library?google=denied");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    redirect("/library?google=failed");
  }

  const tokens = await exchangeCode(
    code,
    `${request.nextUrl.origin}/api/google-books/callback`
  );
  if (!tokens.access_token || !tokens.refresh_token) {
    // No refresh_token usually means a previous grant lingers without one —
    // the member should remove Nestly at myaccount.google.com and retry.
    redirect("/library?google=failed");
  }

  const admin = createAdminClient();
  const row = {
    user_id: userId,
    household_id: membership.household_id,
    google_email: emailFromIdToken(tokens.id_token),
    refresh_token: tokens.refresh_token!,
    access_token: tokens.access_token!,
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    connected_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("library_google_accounts")
    .upsert(row, { onConflict: "user_id" });
  if (error) redirect("/library?google=failed");

  try {
    await syncMemberGoogleBooks(admin, row as GoogleAccount);
  } catch {
    // connection saved; the shelf can be refreshed from the page
    redirect("/library?google=connected-nosync");
  }
  redirect("/library?google=connected");
}
