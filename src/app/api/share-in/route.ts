import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Share intake for the iOS Shortcut ("Send to Nestly"). iPhones can't share
 * to installed web apps, so a Shortcut POSTs the shared content here with the
 * user's personal token, then opens the returned `open` URL — landing on the
 * share-recipe screen which reads it automatically. Accepts multipart form
 * (media file / text / url fields) exactly like the PWA share target.
 */
export async function POST(req: Request) {
  const reqUrl = new URL(req.url);
  const token =
    reqUrl.searchParams.get("token") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.length < 20)
    return NextResponse.json({ ok: false, error: "Missing key" }, { status: 401 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("share_tokens")
    .select("id, household_id")
    .eq("token", token)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "Unknown key" }, { status: 401 });
  await admin
    .from("share_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  const origin = reqUrl.origin;
  let file: File | null = null;
  let text = "";
  let url = "";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("form-urlencoded")) {
    const form = await req.formData();
    const media = form.get("media") ?? form.get("file");
    if (media instanceof File && media.size > 0) file = media;
    text = String(form.get("text") ?? "");
    url = String(form.get("url") ?? "");
  } else if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    // Shortcuts "Request Body: File" sends the raw file
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > 0)
      file = new File([buf], contentType.startsWith("video/") ? "shared.mp4" : "shared.jpg", {
        type: contentType,
      });
  } else {
    text = (await req.text()).trim();
  }

  // shared text may itself be a link
  if (!url) url = (text.match(/https?:\/\/\S+/) ?? [""])[0];

  if (file) {
    const isVideo = file.type.startsWith("video/");
    if (file.size > (isVideo ? 300 : 15) * 1024 * 1024)
      return NextResponse.json({ ok: false, error: "File too big" }, { status: 413 });
    const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
    const path = `${row.household_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from("video-temp")
      .upload(path, file, { contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg") });
    if (error) return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
    return NextResponse.json({
      ok: true,
      open: `${origin}/share-recipe?${isVideo ? "video" : "image"}=${encodeURIComponent(path)}`,
    });
  }

  if (url && !/^https?:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)\//i.test(url))
    return NextResponse.json({
      ok: true,
      open: `${origin}/share-recipe?url=${encodeURIComponent(url)}`,
    });

  const clean = text.trim();
  if (clean.length >= 40) {
    if (clean.length <= 1500)
      return NextResponse.json({
        ok: true,
        open: `${origin}/share-recipe?text=${encodeURIComponent(clean)}`,
      });
    const path = `${row.household_id}/${crypto.randomUUID()}.txt`;
    const { error } = await admin.storage
      .from("video-temp")
      .upload(path, new Blob([clean], { type: "text/plain" }), { contentType: "text/plain" });
    if (error) return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
    return NextResponse.json({
      ok: true,
      open: `${origin}/share-recipe?textfile=${encodeURIComponent(path)}`,
    });
  }

  return NextResponse.json({ ok: true, open: `${origin}/share-recipe` });
}
