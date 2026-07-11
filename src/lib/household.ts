import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/modules";

export type Membership = {
  household_id: string;
  role: MemberRole;
  display_name: string | null;
  household: { id: string; name: string; invite_code: string; base_currency: string };
};

/** Current user's membership (first household), or null. */
export async function getMembership(): Promise<Membership | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("household_members")
    .select(
      "household_id, role, display_name, household:households(id, name, invite_code, base_currency)"
    )
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return (data as unknown as Membership) ?? null;
}
