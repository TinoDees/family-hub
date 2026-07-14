import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user if (and only if) they are a platform admin,
 * otherwise null. Uses the normal RLS client — platform_admins has a
 * select-own-row policy, so a non-admin simply gets no row back.
 * Memoized per request.
 */
export const getPlatformAdmin = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? user : null;
});
