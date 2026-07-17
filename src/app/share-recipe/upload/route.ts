import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

export const maxDuration = 120;

/**
 * POST target for the PWA share sheet. ONE rule for the family: share anything
 * to Nestly — a link, copied text, a screenshot, or a video — and it just
 * reads it. No choices, no "use the right button".
 */
export async function POST(request: Request) {
  const membership = await getMembership();
  const origin = new URL(request.url).origin;
  if (!membership) return NextResponse.redirect(`${origin}/login?next=%2Fshare-recipe`, 303);

  const form = await request.formData();
  const url = String(form.get("url") ?? "");
  const text = String(form.get("text") ?? "");
  const title = String(form.get("title") ?? "");
  const file = form.get("media");

  if (file instanceof File && file.size > 0) {
    const supabase = await createClient();
    if (file.type.startsWith("video/")) {
      if (file.size > 300 * 1024 * 1024)
        return NextResponse.redirect(`${origin}/share-recipe?err=too-big`, 303);
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${membership.household_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-temp")
        .upload(path, file, { contentType: file.type || "video/mp4" });
      if (error) return NextResponse.redirect(`${origin}/share-recipe?err=upload`, 303);
      return NextResponse.redirect(`${origin}/share-recipe?video=${encodeURIComponent(path)}`, 303);
    }
    if (file.type.startsWith("image/")) {
      // screenshots are the universal habit — read them automatically
      if (file.size > 15 * 1024 * 1024)
        return NextResponse.redirect(`${origin}/share-recipe?err=too-big`, 303);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${membership.household_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-temp")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) return NextResponse.redirect(`${origin}/share-recipe?err=upload`, 303);
      return NextResponse.redirect(`${origin}/share-recipe?image=${encodeURIComponent(path)}`, 303);
    }
    return NextResponse.redirect(`${origin}/share-recipe?err=upload`, 303);
  }

  const shared = [url, text, title].find((c) => /https?:\/\//.test(c));
  const sharedUrl = shared?.match(/https?:\/\/\S+/)?.[0];
  if (sharedUrl)
    return NextResponse.redirect(`${origin}/share-recipe?url=${encodeURIComponent(sharedUrl)}`, 303);

  // plain text share (e.g. a copied ChatGPT recipe): short → query param;
  // long → stash as a txt file so nothing gets cut off
  const sharedText = [title, text].filter((s) => s.trim().length > 0).join("\n\n").trim();
  if (sharedText.length >= 40) {
    if (sharedText.length <= 1500)
      return NextResponse.redirect(`${origin}/share-recipe?text=${encodeURIComponent(sharedText)}`, 303);
    const supabase = await createClient();
    const path = `${membership.household_id}/${crypto.randomUUID()}.txt`;
    const { error } = await supabase.storage
      .from("video-temp")
      .upload(path, new Blob([sharedText], { type: "text/plain" }), { contentType: "text/plain" });
    if (!error)
      return NextResponse.redirect(`${origin}/share-recipe?textfile=${encodeURIComponent(path)}`, 303);
  }
  return NextResponse.redirect(`${origin}/share-recipe`, 303);
}
