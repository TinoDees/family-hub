import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/modules";

export type Membership = {
  household_id: string;
  role: MemberRole;
  display_name: string | null;
  household: {
    id: string;
    name: string;
    invite_code: string;
    base_currency: string;
    receipt_retention_days: number | null;
    device_safety_service: string | null;
    idle_lock_enabled: boolean;
    idle_lock_minutes: number;
    overnight_logout_at: string | null;
    timezone: string;
  };
};

/** Current user's membership (first household), or null. Memoized per request. */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("household_members")
    .select(
      "household_id, role, display_name, household:households(id, name, invite_code, base_currency, receipt_retention_days, device_safety_service, idle_lock_enabled, idle_lock_minutes, overnight_logout_at, timezone)"
    )
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return (data as unknown as Membership) ?? null;
});
