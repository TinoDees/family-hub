import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { parseLayout, layoutToTree } from "@/lib/nav-catalog";
import { NavBuilder } from "@/components/nav-builder";

/**
 * Platform-wide default menu (scope "global") — the layout every household
 * starts from. Stored in platform_settings under key 'nav_default' (writes go
 * through the service-role client in the nav actions, guarded by
 * getPlatformAdmin). Households override it with their family menu, members
 * with their personal menu — resolution is personal → household → global →
 * built-in default. Full module catalog: no permission gating here, because
 * each household's permissions still apply on top at render time.
 */
export default async function AdminNavigationPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "nav_default")
    .maybeSingle();
  const tree = layoutToTree(parseLayout(data?.value ?? null), null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Default menu for every household</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          The menu every household starts with. Households can override it with their own family
          menu (and members with a personal one) — this default only applies where they
          haven&apos;t. Each household&apos;s permissions still decide who can open what.
        </p>
      </div>
      <NavBuilder scope="global" initial={tree} />
    </div>
  );
}
