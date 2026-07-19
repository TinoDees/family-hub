"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

/**
 * Receipt scanning for shopping lists (mig 057). Claude reads the photo AND
 * auto-matches lines to the list's items in one pass (it gets the item list
 * in the prompt); the review modal only exists for the leftovers — tap to
 * fix, never drag. Prices land on items, the list gets a spend record, and
 * pantry items remember their last price.
 */

export type ReceiptLine = {
  label: string;
  price: number;
  itemId: string | null;
};

export type ReceiptScan = {
  ok: boolean;
  error?: string;
  path?: string;
  store?: string | null;
  date?: string | null;
  total?: number | null;
  lines?: ReceiptLine[];
};

export async function scanShoppingReceipt(
  listId: string,
  imageBase64: string,
  mediaType: string
): Promise<ReceiptScan> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!list) return { ok: false, error: "List not found" };

  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType))
    return { ok: false, error: "That image format isn't readable (probably HEIC). Screenshot it and try again." };
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: "Image too large (max 5MB)" };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI reading needs ANTHROPIC_API_KEY set on the server." };

  const ext = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : "webp";
  const path = `${membership.household_id}/${listId}/receipt-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("receipts")
    .upload(path, bytes, { contentType: mediaType });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: items } = await supabase
    .from("shopping_list_items")
    .select("id, name")
    .eq("list_id", listId);
  const itemIds = new Set((items ?? []).map((i) => i.id));

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
                  `Read this shopping receipt. This shopping list was being bought: ${JSON.stringify(
                    (items ?? []).map((i) => ({ id: i.id, name: i.name }))
                  )}.\n` +
                  'Reply with ONLY a JSON object, no other text: {"store": string or null, "date": "YYYY-MM-DD" or null, "total": number or null, "lines": [{"label": string, "price": number, "item_id": string or null}]}.\n' +
                  '"total" is the final amount paid. Each line is one purchased product with its line total in the receipt currency; skip subtotals, discounts applied to the whole docket, loyalty rows and payment rows. ' +
                  'Set "item_id" to the id of the shopping-list item this product clearly is (receipt abbreviations like "TP QUILTON 24PK" match "Toilet Paper"); use null when unsure or when the product is not on the list. Never invent ids.',
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI reading failed (${res.status}). Try again.`, path };
    const data = await res.json();
    let text: string = data?.content?.[0]?.text ?? "";
    text = text.replace(/```(?:json)?/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: { store?: unknown; date?: unknown; total?: unknown; lines?: unknown } = {};
    try {
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      return { ok: false, error: "The AI answer was garbled. Try scanning again.", path };
    }

    const lines: ReceiptLine[] = [];
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
    return { ok: false, error: "AI reading failed. Try again.", path };
  }
}

export type ReceiptAssignment = { itemId: string; price: number };

export async function applyShoppingReceipt(
  listId: string,
  path: string,
  store: string | null,
  total: number | null,
  assignments: ReceiptAssignment[]
): Promise<{ ok: boolean; error?: string }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!list) return { ok: false, error: "List not found" };

  const clean = assignments
    .filter((a) => a.itemId && typeof a.price === "number" && isFinite(a.price) && a.price >= 0)
    .slice(0, 200);

  // price the items and mark them bought
  const priced: { id: string; name: string; price: number }[] = [];
  for (const a of clean) {
    const { data: item } = await supabase
      .from("shopping_list_items")
      .update({ price: Math.round(a.price * 100) / 100, checked: true, checked_by: userId })
      .eq("id", a.itemId)
      .eq("list_id", listId)
      .eq("household_id", membership.household_id)
      .select("id, name, price")
      .maybeSingle();
    if (item) priced.push({ id: item.id, name: item.name, price: Number(item.price) });
  }

  // spend record on the list
  const { error: listErr } = await supabase
    .from("shopping_lists")
    .update({
      receipt_path: path,
      receipt_store: store?.trim().slice(0, 60) || null,
      receipt_total: total !== null && isFinite(total) ? Math.round(total * 100) / 100 : null,
      spent_at: new Date().toISOString(),
    })
    .eq("id", listId)
    .eq("household_id", membership.household_id);
  if (listErr) return { ok: false, error: listErr.message };

  // last-price memory on matching pantry items (feeds future estimates)
  if (priced.length > 0) {
    const { data: pantry } = await supabase
      .from("pantry_items")
      .select("id, name")
      .eq("household_id", membership.household_id);
    const byName = new Map((pantry ?? []).map((p) => [p.name.toLowerCase().trim(), p.id]));
    const now = new Date().toISOString();
    for (const item of priced) {
      const pid = byName.get(item.name.toLowerCase().trim());
      if (!pid) continue;
      await supabase
        .from("pantry_items")
        .update({ last_price: item.price, last_price_at: now })
        .eq("id", pid)
        .eq("household_id", membership.household_id);
    }
  }

  revalidatePath("/shopping");
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}
