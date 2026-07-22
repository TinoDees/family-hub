import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/module-guard";
import { googleBooksConfigured, googleAuthUrl } from "@/lib/google-books";

/**
 * Kick off the per-member Google OAuth dance. Any member who can at least
 * VIEW the library may connect their own Google account (it only adds
 * visibility of books they already own).
 */
export async function GET(request: NextRequest) {
  await requireModule("library", "view");
  if (!googleBooksConfigured()) redirect("/library?google=unconfigured");

  const state = crypto.randomUUID();
  const store = await cookies();
  store.set("gb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax", // Google returns via a top-level GET — lax still sends it
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  redirect(googleAuthUrl(`${request.nextUrl.origin}/api/google-books/callback`, state));
}
