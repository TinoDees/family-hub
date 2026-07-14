"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function safeNext(raw: FormDataEntryValue | null): string | null {
  const next = String(raw ?? "");
  // only allow same-site relative paths
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
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
  if (error)
    redirect(
      `/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
    );
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
  if (error)
    redirect(
      `/signup?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
    );
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
