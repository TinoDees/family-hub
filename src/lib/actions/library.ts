"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/module-guard";
import {
  googleBooksConfigured,
  syncMemberGoogleBooks,
  revokeGoogleToken,
  type GoogleAccount,
} from "@/lib/google-books";

const FILE_TYPES = ["epub", "pdf", "audio"] as const;

export type SaveResult = { ok: boolean; error?: string; id?: string };

/** A storage path the client hands us must live inside its own household folder. */
function safePath(raw: unknown, householdId: string, sub: "books" | "covers"): string | null {
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path) return null;
  if (!path.startsWith(`${householdId}/${sub}/`) || path.includes("..")) return null;
  return path.slice(0, 400);
}

/**
 * Register an uploaded book. The FILE goes direct-to-storage from the browser
 * (RLS-checked) so big epubs/audiobooks never squeeze through the server
 * action body limit — this action only validates and writes the row.
 * The "I own this" checkbox is REQUIRED and stored (legal guardrail).
 */
export async function createLibraryBook(formData: FormData): Promise<SaveResult> {
  const { membership, userId } = await requireModule("library", "edit");

  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const author = String(formData.get("author") ?? "").trim().slice(0, 300) || null;
  const rawType = String(formData.get("file_type") ?? "");
  const file_type = (FILE_TYPES as readonly string[]).includes(rawType) ? rawType : null;
  const storage_path = safePath(formData.get("storage_path"), membership.household_id, "books");
  const cover_path = safePath(formData.get("cover_path"), membership.household_id, "covers");
  const mime = String(formData.get("mime") ?? "").trim().slice(0, 100) || null;
  const bytes = parseInt(String(formData.get("file_bytes") ?? ""), 10);
  const owned = formData.get("ownership_confirmed") === "on";

  if (!title) return { ok: false, error: "Give the book a title first." };
  if (!file_type || !storage_path)
    return { ok: false, error: "The file didn't upload properly — try again." };
  if (!owned)
    return { ok: false, error: "Please confirm this is a book you own before adding it." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_books")
    .insert({
      household_id: membership.household_id,
      owner_id: userId,
      title,
      author,
      file_type,
      storage_path,
      cover_path,
      mime,
      file_bytes: isNaN(bytes) ? null : bytes,
      ownership_confirmed: true,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };

  revalidatePath("/library");
  return { ok: true, id: data.id };
}

/** Form action for the detail page's Delete button. */
export async function deleteLibraryBook(formData: FormData) {
  const { membership } = await requireModule("library", "edit");
  const id = String(formData.get("book_id") ?? "");

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("library_books")
    .select("id, storage_path, cover_path")
    .eq("id", id)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (book) {
    const paths = [book.storage_path, book.cover_path].filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from("library").remove(paths);
    await supabase.from("library_books").delete().eq("id", book.id);
  }
  revalidatePath("/library");
  redirect("/library");
}

/**
 * Save the member's personal reading/listening position.
 * position: epub CFI string, audio seconds, or pdf page — opaque text.
 */
export async function saveLibraryProgress(
  bookId: string,
  position: string,
  percent: number | null
): Promise<{ ok: boolean }> {
  const { membership, userId } = await requireModule("library", "view");
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("library_books")
    .select("id")
    .eq("id", bookId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!book) return { ok: false };

  const pct =
    typeof percent === "number" && isFinite(percent)
      ? Math.max(0, Math.min(100, Math.round(percent * 10) / 10))
      : null;

  await supabase.from("library_progress").upsert(
    {
      book_id: bookId,
      user_id: userId,
      household_id: membership.household_id,
      position: String(position).slice(0, 2000),
      percent: pct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "book_id,user_id" }
  );
  return { ok: true };
}

export type GoogleShelfResult = { ok: boolean; error?: string; count?: number };

/** Re-sync the CURRENT member's Google shelf into the household cache. */
export async function refreshGoogleShelf(): Promise<GoogleShelfResult> {
  const { userId } = await requireModule("library", "view");
  if (!googleBooksConfigured())
    return { ok: false, error: "The Google connection isn't configured yet." };

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("library_google_accounts")
    .select("user_id, household_id, google_email, refresh_token, access_token, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Connect your Google account first." };

  try {
    const count = await syncMemberGoogleBooks(admin, account as GoogleAccount);
    revalidatePath("/library");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed — try again." };
  }
}

/** Remove the member's Google connection and their cached volumes. */
export async function disconnectGoogle(): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireModule("library", "view");
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("library_google_accounts")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (account?.refresh_token) await revokeGoogleToken(account.refresh_token);

  await supabase.from("library_google_books").delete().eq("user_id", userId);
  await supabase.from("library_google_accounts").delete().eq("user_id", userId);
  revalidatePath("/library");
  return { ok: true };
}
