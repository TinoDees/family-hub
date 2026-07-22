/**
 * Google Play Books integration — SERVER ONLY helpers.
 *
 * Each member connects their own Google account (OAuth, offline access).
 * We store the refresh token in library_google_accounts (RLS: owner-only),
 * then read every connected member's shelves via the Books API and cache the
 * volume metadata in library_google_books so the whole household sees one
 * combined Google shelf. Files never leave Google — DRM stays intact and we
 * deep-link out to Play Books for reading.
 *
 * Env-gated on GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (see
 * docs/google-books-setup.md). Without them the UI shows a friendly
 * "not configured yet" card and nothing else happens.
 *
 * The `server-only` package is not installed in this repo, so this comment is
 * the guard: never import from a client component (tokens must not leak).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const BOOKS_API = "https://www.googleapis.com/books/v1";

/** Google's fixed shelf ids we skip: 6 Recently viewed, 8 Books for you. */
const SKIP_SHELVES = new Set([6, 8]);
const MAX_VOLUMES = 400;

export type GoogleAccount = {
  user_id: string;
  household_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  token_expires_at: string | null;
};

export type GoogleVolume = {
  volume_id: string;
  title: string;
  authors: string | null;
  thumbnail_url: string | null;
  info_link: string | null;
};

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export function googleBooksConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The consent-screen URL we bounce the member to. */
export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/books openid email",
    access_type: "offline",
    prompt: "consent", // ensures we get a refresh_token every time
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

/** Pull the email out of the id_token (came straight from Google over TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")
    ) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Valid access token for a member — refreshes and persists when expiring. */
export async function freshAccessToken(
  admin: SupabaseClient,
  account: GoogleAccount
): Promise<string> {
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && exp > Date.now() + 60_000) return account.access_token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) {
    throw new Error("Google session expired — disconnect and connect again.");
  }
  await admin
    .from("library_google_accounts")
    .update({
      access_token: json.access_token,
      token_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("user_id", account.user_id);
  return json.access_token;
}

type ApiVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    infoLink?: string;
    canonicalVolumeLink?: string;
  };
};

/** Every volume on the member's shelves (deduped), metadata only. */
export async function fetchLibraryVolumes(token: string): Promise<GoogleVolume[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const shelvesRes = await fetch(`${BOOKS_API}/mylibrary/bookshelves`, {
    headers,
    cache: "no-store",
  });
  if (!shelvesRes.ok) {
    throw new Error(`Google Books said no (${shelvesRes.status}) — try reconnecting.`);
  }
  const shelves = (((await shelvesRes.json()) as { items?: unknown }).items ?? []) as {
    id?: number;
    volumeCount?: number;
  }[];

  const out = new Map<string, GoogleVolume>();
  for (const shelf of shelves) {
    if (typeof shelf.id !== "number" || SKIP_SHELVES.has(shelf.id)) continue;
    // NB: don't trust shelf.volumeCount — Google often reports 0 for shelves
    // that do hold books (esp. "My Google eBooks"). Always page until empty.
    let start = 0;
    while (start < MAX_VOLUMES && out.size < MAX_VOLUMES) {
      const res = await fetch(
        `${BOOKS_API}/mylibrary/bookshelves/${shelf.id}/volumes?maxResults=40&startIndex=${start}`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) break;
      const items = (((await res.json()) as { items?: unknown }).items ?? []) as ApiVolume[];
      if (items.length === 0) break;
      for (const v of items) {
        const info = v.volumeInfo;
        if (!v.id || !info?.title) continue;
        const thumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
        out.set(v.id, {
          volume_id: v.id,
          title: info.title.slice(0, 300),
          authors: info.authors?.join(", ").slice(0, 300) ?? null,
          thumbnail_url: thumb ? thumb.replace(/^http:/, "https:") : null,
          info_link: info.canonicalVolumeLink ?? info.infoLink ?? null,
        });
      }
      if (items.length < 40) break;
      start += items.length;
    }
  }
  return Array.from(out.values());
}

/** Full re-sync of one member's cached Google shelf. Returns volume count. */
export async function syncMemberGoogleBooks(
  admin: SupabaseClient,
  account: GoogleAccount
): Promise<number> {
  const token = await freshAccessToken(admin, account);
  const volumes = await fetchLibraryVolumes(token);
  await admin.from("library_google_books").delete().eq("user_id", account.user_id);
  if (volumes.length > 0) {
    await admin.from("library_google_books").insert(
      volumes.map((v) => ({
        ...v,
        user_id: account.user_id,
        household_id: account.household_id,
      }))
    );
  }
  await admin
    .from("library_google_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", account.user_id);
  return volumes.length;
}

/** Best-effort revoke on disconnect — Google also lets users revoke anytime. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // fine — the row is deleted either way
  }
}
