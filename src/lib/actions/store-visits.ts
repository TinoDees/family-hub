"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import type { ReceiptScan } from "@/lib/actions/shopping-receipt";

/**
 * Shopping trip mode (mig 058): start a stop at a store, tick items while
 * shopping (ticks get tagged with the visit), finish with a receipt scan —
 * every receipt line lands in price_records per retailer, the raw dataset for
 * future "cheaper at X" advice. Whatever's unticked stays for the next stop.
 */

export type ActiveVisit = {
  id: string;
  retailer_id: string | null;
  store_label: string | null;
  started_at: string;
};

export async function startVisitInline(
  retailerId: string | null,
  storeLabel: string | null
): Promise<{ ok: boolean; error?: string; visit?: ActiveVisit }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  // one active stop per household — resume it if someone already started
  const { data: active } = await supabase
    .from("store_visits")
    .select("id, retailer_id, store_label, started_at")
    .eq("household_id", membership.household_id)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return { ok: true, visit: active as ActiveVisit };

  let label = storeLabel?.trim().slice(0, 60) || null;
  if (retailerId) {
    const { data: r } = await supabase
      .from("retailers")
      .select("id, name")
      .eq("id", retailerId)
      .eq("household_id", membership.household_id)
      .maybeSingle();
    if (!r) return { ok: false, error: "Retailer not found" };
    label = r.name;
  }
  if (!retailerId && !label) return { ok: false, error: "Pick a store or type its name" };

  const { data, error } = await supabase
    .from("store_visits")
    .insert({
      household_id: membership.household_id,
      retailer_id: retailerId,
      store_label: label,
      created_by: userId,
    })
    .select("id, retailer_id, store_label, started_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start" };
  revalidatePath("/shopping");
  return { ok: true, visit: data as ActiveVisit };
}

/**
 * Retro visit — "we already shopped, here's the receipt". Created finished so
 * it never shows as an active stop; the receipt apply fills it in.
 */
export async function createRetroVisitInline(
  retailerId: string | null,
  storeLabel: string | null
): Promise<{ ok: boolean; error?: string; visit?: ActiveVisit }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  let label = storeLabel?.trim().slice(0, 60) || null;
  if (retailerId) {
    const { data: r } = await supabase
      .from("retailers")
      .select("id, name")
      .eq("id", retailerId)
      .eq("household_id", membership.household_id)
      .maybeSingle();
    if (!r) return { ok: false, error: "Retailer not found" };
    label = r.name;
  }
  if (!retailerId && !label) return { ok: false, error: "Pick a store or type its name" };

  const { data, error } = await supabase
    .from("store_visits")
    .insert({
      household_id: membership.household_id,
      retailer_id: retailerId,
      store_label: label,
      finished_at: new Date().toISOString(),
      created_by: userId,
    })
    .select("id, retailer_id, store_label, started_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create" };
  return { ok: true, visit: data as ActiveVisit };
}

/** Throw away a visit that never got its receipt (retro flow cancelled). */
export async function discardVisitInline(
  visitId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("store_visits")
    .delete()
    .eq("id", visitId)
    .eq("household_id", membership.household_id)
    .is("receipt_path", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping");
  return { ok: true };
}

/** Abandon a stop: ticks stay ticked, the visit just goes away. */
export async function cancelVisitInline(
  visitId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  await supabase
    .from("shopping_list_items")
    .update({ visit_id: null })
    .eq("visit_id", visitId)
    .eq("household_id", membership.household_id);
  const { error } = await supabase
    .from("store_visits")
    .delete()
    .eq("id", visitId)
    .eq("household_id", membership.household_id)
    .is("finished_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping");
  return { ok: true };
}

/** Finish a stop without a receipt — the ticks keep their visit tag. */
export async function finishVisitInline(
  visitId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("store_visits")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", visitId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping");
  return { ok: true };
}

/** Scan the receipt for a stop — matched against every open-list item. */
export async function scanVisitReceipt(
  visitId: string,
  imageBase64: string,
  mediaType: string
): Promise<ReceiptScan> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("store_visits")
    .select("id")
    .eq("id", visitId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!visit) return { ok: false, error: "Stop not found" };

  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType))
    return { ok: false, error: "That image format isn't readable (probably HEIC) — screenshot it and try again." };
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: "Image too large (max 5MB)" };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI reading needs ANTHROPIC_API_KEY set on the server." };

  const ext = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : "webp";
  const path = `${membership.household_id}/visits/receipt-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("receipts")
    .upload(path, bytes, { contentType: mediaType });
  if (upErr) return { ok: false, error: upErr.message };

  // candidates: items on open lists plus recently finished ones (retro
  // receipts often arrive after the list was marked done). Priority order for
  // the prompt: ticked-this-stop → bought-but-unpriced → unticked → the rest.
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, status, created_at")
    .eq("household_id", membership.household_id)
    .or(`status.eq.open,created_at.gte.${weekAgo}`);
  const listIds = (lists ?? []).map((l) => l.id);
  const { data: items } = listIds.length
    ? await supabase
        .from("shopping_list_items")
        .select("id, name, visit_id, checked, price")
        .in("list_id", listIds)
    : { data: [] };
  const rank = (i: { visit_id: string | null; checked: boolean; price: number | null }) =>
    i.visit_id === visitId ? 0 : i.checked && i.price === null ? 1 : !i.checked ? 2 : 3;
  const sorted = [...(items ?? [])].sort((a, b) => rank(a) - rank(b));
  const itemIds = new Set(sorted.map((i) => i.id));

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
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              {
                type: "text",
                text:
                  `Read this shopping receipt. These shopping-list items were being bought (the first ones were ticked off in this store): ${JSON.stringify(
                    sorted.map((i) => ({ id: i.id, name: i.name }))
                  )}.\n` +
                  'Reply with ONLY a JSON object, no other text: {"store": string or null, "date": "YYYY-MM-DD" or null, "total": number or null, "lines": [{"label": string, "price": number, "item_id": string or null}]}.\n' +
                  '"total" is the final amount paid. Each line is one purchased product with its line total; skip subtotals, whole-docket discounts, loyalty and payment rows. ' +
                  'Set "item_id" to the id of the list item this product clearly is (receipt abbreviations like "TP QUILTON 24PK" match "Toilet Paper"); null when unsure or not on the list. Never invent ids.',
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI reading failed (${res.status}) — try again.`, path };
    const data = await res.json();
    let text: string = data?.content?.[0]?.text ?? "";
    text = text.replace(/```(?:json)?/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: { store?: unknown; date?: unknown; total?: unknown; lines?: unknown } = {};
    try {
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      return { ok: false, error: "The AI answer was garbled — try scanning again.", path };
    }
    const lines: { label: string; price: number; itemId: string | null }[] = [];
    if (Array.isArray(parsed.lines)) {
      for (const raw of parsed.lines as { label?: unknown; price?: unknown; item_id?: unknown }[]) {
        if (typeof raw?.label !== "string" || typeof raw?.price !== "number" || !isFinite(raw.price)) continue;
        lines.push({
          label: raw.label.slice(0, 120),
          price: Math.round(raw.price * 100) / 100,
          itemId: typeof raw.item_id === "string" && itemIds.has(raw.item_id) ? raw.item_id : null,
        });
        if (lines.length >= 80) break;
      }
    }
    return {
      ok: true,
      path,
      store: typeof parsed.store === "string" ? parsed.store.slice(0, 60) : null,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      total: typeof parsed.total === "number" && isFinite(parsed.total) ? Math.round(parsed.total * 100) / 100 : null,
      lines,
    };
  } catch {
    return { ok: false, error: "AI reading failed — try again.", path };
  }
}

export type VisitLine = { itemId: string; price: number; label: string };

/** Apply the receipt: price + tick the items, record every line in
 * price_records (per retailer — the dataset), close the stop. */
export async function applyVisitReceipt(
  visitId: string,
  path: string,
  store: string | null,
  total: number | null,
  lines: VisitLine[]
): Promise<{ ok: boolean; error?: string }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("store_visits")
    .select("id, retailer_id, store_label")
    .eq("id", visitId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!visit) return { ok: false, error: "Stop not found" };

  const clean = lines
    .filter((l) => l.itemId && typeof l.price === "number" && isFinite(l.price) && l.price >= 0)
    .slice(0, 200);

  // per-item sums (two receipt lines of milk = one item price)
  const sums = new Map<string, number>();
  for (const l of clean)
    sums.set(l.itemId, Math.round(((sums.get(l.itemId) ?? 0) + l.price) * 100) / 100);

  const priced: { id: string; name: string; price: number }[] = [];
  for (const [itemId, price] of sums) {
    const { data: item } = await supabase
      .from("shopping_list_items")
      .update({ price, checked: true, checked_by: userId, visit_id: visitId })
      .eq("id", itemId)
      .eq("household_id", membership.household_id)
      .select("id, name, price")
      .maybeSingle();
    if (item) priced.push({ id: item.id, name: item.name, price: Number(item.price) });
  }
  const nameById = new Map(priced.map((p) => [p.id, p.name]));

  // the dataset: one price_records row per receipt line
  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("id, name")
    .eq("household_id", membership.household_id);
  const pantryByName = new Map((pantry ?? []).map((p) => [p.name.toLowerCase().trim(), p.id]));
  const storeName = store?.trim().slice(0, 60) || visit.store_label || null;
  if (clean.length > 0) {
    await supabase.from("price_records").insert(
      clean.map((l) => {
        const itemName = nameById.get(l.itemId) ?? l.label;
        return {
          household_id: membership.household_id,
          visit_id: visitId,
          retailer_id: visit.retailer_id,
          store_name: storeName,
          item_name: itemName,
          line_label: l.label,
          pantry_item_id: pantryByName.get(itemName.toLowerCase().trim()) ?? null,
          price: l.price,
        };
      })
    );
  }

  // last-price memory on the pantry
  const now = new Date().toISOString();
  for (const p of priced) {
    const pid = pantryByName.get(p.name.toLowerCase().trim());
    if (!pid) continue;
    await supabase
      .from("pantry_items")
      .update({ last_price: p.price, last_price_at: now })
      .eq("id", pid)
      .eq("household_id", membership.household_id);
  }

  // close the stop
  const { error: visitErr } = await supabase
    .from("store_visits")
    .update({
      receipt_path: path,
      receipt_store: storeName,
      receipt_total: total !== null && isFinite(total) ? Math.round(total * 100) / 100 : null,
      finished_at: now,
    })
    .eq("id", visitId)
    .eq("household_id", membership.household_id);
  if (visitErr) return { ok: false, error: visitErr.message };

  revalidatePath("/shopping");
  return { ok: true };
}
