/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * This client uses SUPABASE_SERVICE_ROLE_KEY and BYPASSES row-level security.
 * Never import it from a client component or pass it (or its data, unfiltered)
 * to the browser. The `server-only` package is not installed in this repo, so
 * this comment is the guard: only use from server components, server actions,
 * and route handlers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
