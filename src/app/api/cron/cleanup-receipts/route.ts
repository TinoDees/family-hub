import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily cleanup: deletes receipt scans (photos with caption 'Receipt') older
 * than the household's receipt_retention_days. Null retention = keep forever.
 * Secured by Vercel cron's Authorization: Bearer CRON_SECRET header.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "No service key" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: households } = await admin
    .from("households")
    .select("id, receipt_retention_days")
    .not("receipt_retention_days", "is", null);

  let deleted = 0;
  for (const h of households ?? []) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - h.receipt_retention_days!);

    const { data: old } = await admin
      .from("photos")
      .select("id, storage_path")
      .eq("household_id", h.id)
      .eq("caption", "Receipt")
      .lt("created_at", cutoff.toISOString())
      .limit(200);

    if (old && old.length > 0) {
      // detach from expenses, remove files, remove rows
      await admin
        .from("trip_expenses")
        .update({ receipt_photo_id: null })
        .in("receipt_photo_id", old.map((p) => p.id));
      await admin.storage.from("photos").remove(old.map((p) => p.storage_path));
      await admin.from("photos").delete().in("id", old.map((p) => p.id));
      deleted += old.length;
    }
  }
  return NextResponse.json({ ok: true, deleted });
}
