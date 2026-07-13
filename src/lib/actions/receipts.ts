"use server";

import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export type ScanResult = {
  ok: boolean;
  error?: string;
  photoId?: string;
  merchant?: string | null;
  total?: number | null;
  date?: string | null;
  items?: { description: string; amount: number }[];
  originalTotal?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
};

/**
 * Stores the receipt image in the trip's album and asks Claude to read
 * merchant / total / date from it. Env-gated on ANTHROPIC_API_KEY.
 */
export async function scanReceipt(
  tripId: string,
  imageBase64: string,
  mediaType: string
): Promise<ScanResult> {
  const supabase = await createClient();

  // RLS decides who can see the trip: household members AND trip guests.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, household_id")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return { ok: false, error: "Trip not found" };
  const householdId = trip.household_id;

  // ensure the trip album exists (also feeds the Photo Album module)
  let { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!album) {
    const { data: created, error } = await supabase
      .from("albums")
      .insert({
        household_id: householdId,
        name: trip.name,
        description: "Trip album",
        trip_id: trip.id,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Could not create album" };
    album = created;
  }

  // store the image
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: "Image too large" };
  const ext = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : "webp";
  const path = `${householdId}/${album.id}/receipt-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("photos")
    .upload(path, bytes, { contentType: mediaType });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: photo, error: rowErr } = await supabase
    .from("photos")
    .insert({
      household_id: householdId,
      album_id: album.id,
      storage_path: path,
      caption: "Receipt",
    })
    .select("id")
    .single();
  if (rowErr || !photo) return { ok: false, error: rowErr?.message ?? "Could not save photo" };

  // read it with Claude (optional — expense can still be typed manually)
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      ok: true,
      photoId: photo.id,
      error: "Receipt saved. AI reading needs ANTHROPIC_API_KEY — fill the details in manually.",
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: 'Read this receipt. Reply with ONLY a JSON object, no other text: {"merchant": string or null, "total": number or null, "date": "YYYY-MM-DD" or null, "currency": string, "items": [{"description": string, "qty": number, "unit_amount": number, "line_total": number}]}. "total" is the final amount paid including tax/tip. "currency" is the ISO 4217 code of the receipt (THB, AUD, EUR, USD…) judged from symbols/language/location. For each line item: qty = how many (1 if not stated), unit_amount = price for ONE, line_total = qty x unit_amount as printed. [] if unreadable.',
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: true, photoId: photo.id, error: `Receipt saved; AI reading failed (${res.status}) — fill in manually.` };
    }
    const data = await res.json();
    let text: string = data?.content?.[0]?.text ?? "";
    text = text.replace(/```(?:json)?/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown> & { items?: unknown; total?: unknown; merchant?: unknown; date?: unknown } = {};
    try {
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      return {
        ok: true,
        photoId: photo.id,
        error: "Receipt saved; the AI answer was garbled — try scanning again.",
      };
    }
    // normalise: explode quantity lines into unit rows so counts can be
    // allocated per person ("Tino had 2"), with cent-exact unit amounts.
    type RawItem = { description?: unknown; qty?: unknown; unit_amount?: unknown; line_total?: unknown };
    let units: { description: string; amount: number }[] = [];
    if (Array.isArray(parsed.items)) {
      for (const raw of parsed.items as RawItem[]) {
        if (!raw?.description) continue;
        const lineTotal =
          typeof raw.line_total === "number"
            ? raw.line_total
            : typeof raw.unit_amount === "number" && typeof raw.qty === "number"
              ? raw.unit_amount * raw.qty
              : null;
        if (lineTotal === null) continue;
        const qty =
          typeof raw.qty === "number" && Number.isInteger(raw.qty) && raw.qty >= 1 && raw.qty <= 12
            ? raw.qty
            : 1;
        const desc = String(raw.description).slice(0, 200);
        const totalCents = Math.round(lineTotal * 100);
        const baseCents = Math.floor(totalCents / qty);
        const rem = totalCents - baseCents * qty;
        for (let u = 0; u < qty; u++) {
          units.push({ description: desc, amount: (baseCents + (u < rem ? 1 : 0)) / 100 });
        }
        if (units.length > 60) break;
      }
    }
    // sanity check: unit rows should roughly add up to the total
    let itemWarning: string | undefined;
    if (typeof parsed.total === "number" && units.length > 0) {
      const sum = units.reduce((acc, i) => acc + i.amount, 0);
      if (Math.abs(sum - parsed.total) > Math.max(1, parsed.total * 0.15)) {
        units = [];
        itemWarning =
          "Line items didn't match the total, so they were dropped — allocate manually or re-scan.";
      }
    }
    parsed.items = units;

    // currency conversion: receipt currency -> household base currency
    let originalTotal: number | null = null;
    let originalCurrency: string | null = null;
    let fxRate: number | null = null;
    const receiptCurrency =
      typeof parsed.currency === "string" && /^[A-Z]{3}$/.test(parsed.currency.toUpperCase())
        ? parsed.currency.toUpperCase()
        : null;
    if (receiptCurrency) {
      const { data: hh } = await supabase
        .from("households")
        .select("base_currency")
        .eq("id", householdId)
        .maybeSingle();
      const base = (hh?.base_currency ?? "AUD").toUpperCase();
      if (receiptCurrency !== base && typeof parsed.total === "number") {
        try {
          const fx = await fetch(
            `https://api.frankfurter.app/latest?from=${receiptCurrency}&to=${base}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (fx.ok) {
            const fxData = await fx.json();
            const rate = fxData?.rates?.[base];
            if (typeof rate === "number" && rate > 0) {
              originalTotal = parsed.total as number;
              originalCurrency = receiptCurrency;
              fxRate = rate;
              parsed.total = Math.round((parsed.total as number) * rate * 100) / 100;
              parsed.items = (parsed.items as { description: string; amount: number }[]).map((i) => ({
                ...i,
                amount: Math.round(i.amount * rate * 100) / 100,
              }));
            }
          }
        } catch {
          /* no rate — leave amounts as printed, flag below */
        }
        if (!fxRate) {
          return {
            ok: true,
            photoId: photo.id,
            merchant: typeof parsed.merchant === "string" ? parsed.merchant : null,
            total: typeof parsed.total === "number" ? parsed.total : null,
            date: typeof parsed.date === "string" ? parsed.date : null,
            items: parsed.items as { description: string; amount: number }[],
            originalCurrency: receiptCurrency,
            error: `This receipt is in ${receiptCurrency} but I couldn't fetch an exchange rate — amounts are unconverted, adjust manually.`,
          };
        }
      }
    }
    return {
      ...(itemWarning ? { error: itemWarning } : {}),
      ok: true,
      photoId: photo.id,
      merchant: typeof parsed.merchant === "string" ? parsed.merchant : null,
      total: typeof parsed.total === "number" ? parsed.total : null,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      items: parsed.items as { description: string; amount: number }[],
      originalTotal,
      originalCurrency,
      fxRate,
    };
  } catch {
    return { ok: true, photoId: photo.id, error: "Receipt saved; AI reading failed — fill in manually." };
  }
}

/** Detach and delete the stored receipt scan for one expense. */
export async function removeReceipt(formData: FormData) {
  const { membership } = await requireModule("holidays", "edit");
  const expenseId = String(formData.get("expense_id"));
  const tripId = String(formData.get("trip_id"));

  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("trip_expenses")
    .select("id, receipt_photo_id")
    .eq("id", expenseId)
    .eq("household_id", membership.household_id)
    .maybeSingle();

  if (expense?.receipt_photo_id) {
    const { data: photo } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("id", expense.receipt_photo_id)
      .maybeSingle();
    await supabase
      .from("trip_expenses")
      .update({ receipt_photo_id: null })
      .eq("id", expenseId);
    if (photo) {
      await supabase.storage.from("photos").remove([photo.storage_path]);
      await supabase.from("photos").delete().eq("id", expense.receipt_photo_id);
    }
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/holidays/${tripId}/expenses`);
  const { redirect } = await import("next/navigation");
  redirect(`/holidays/${tripId}/expenses`);
}
