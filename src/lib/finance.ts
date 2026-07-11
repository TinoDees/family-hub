import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership, type Membership } from "@/lib/household";
import { getPermissions, accessFor, canAtLeast } from "@/lib/permissions";
import type { Access } from "@/lib/modules";

export type FinanceContext = {
  membership: Membership;
  access: Access;
  userId: string;
};

/** Guard for finance pages/actions. Redirects when below `min`. */
export async function requireFinance(min: Access = "view"): Promise<FinanceContext> {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const perms = await getPermissions(membership.household_id, user!.id, membership.role);
  const access = accessFor(perms, "finance");
  if (!canAtLeast(access, min)) redirect("/dashboard");
  return { membership, access, userId: user!.id };
}

export function formatMoney(amount: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

export function monthBounds(m?: string) {
  // m = "2026-07"; defaults to current month
  const now = new Date();
  const [y, mo] = m
    ? m.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const endDate = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  return { start, end, label: new Date(y, mo - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" }), key: `${y}-${String(mo).padStart(2, "0")}` };
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
