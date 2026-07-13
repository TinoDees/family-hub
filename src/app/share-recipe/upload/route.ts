import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

export const maxDuration = 120;

/** POST target for the PWA share sheet: video files land here. */
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
    if (file.type.startsWith("video/")) {
      if (file.size > 300 * 1024 * 1024)
        return NextResponse.redirect(`${origin}/share-recipe?err=too-big`, 303);
      const supabase = await createClient();
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${membership.household_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-temp")
        .upload(path, file, { contentType: file.type || "video/mp4" });
      if (error) return NextResponse.redirect(`${origin}/share-recipe?err=upload`, 303);
      return NextResponse.redirect(`${origin}/share-recipe?video=${encodeURIComponent(path)}`, 303);
    }
    // images: point them at the screenshot reader
    return NextResponse.redirect(`${origin}/recipes/new?error=${encodeURIComponent("Use 'From a screenshot' for images")}`, 303);
  }

  const shared = [url, text, title].find((c) => /https?:\/\//.test(c));
  const sharedUrl = shared?.match(/https?:\/\/\S+/)?.[0];
  return NextResponse.redirect(
    sharedUrl
      ? `${origin}/share-recipe?url=${encodeURIComponent(sharedUrl)}`
      : `${origin}/share-recipe`,
    303
  );
}
