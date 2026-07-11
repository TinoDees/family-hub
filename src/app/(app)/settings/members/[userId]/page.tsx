import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions } from "@/lib/permissions";
import { resetPermissions } from "@/lib/actions/members";
import { PermissionMatrix } from "@/components/permission-matrix";
import type { MemberRole } from "@/lib/modules";

export default async function MemberPermissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { userId } = await params;
  const { saved } = await searchParams;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("household_members")
    .select("user_id, role, display_name")
    .eq("household_id", membership.household_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) notFound();

  const perms = await getPermissions(
    membership.household_id,
    target.user_id,
    target.role as MemberRole
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/settings/members" className="text-xs text-stone-400 hover:underline">
            ← Members
          </Link>
          <h2 className="text-lg font-semibold">
            {target.display_name ?? "Member"}{" "}
            <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">
              {target.role}
            </span>
          </h2>
        </div>
        <form action={resetPermissions}>
          <input type="hidden" name="user_id" value={target.user_id} />
          <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
            Reset to role defaults
          </button>
        </form>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>
      )}

      <PermissionMatrix
        targetUserId={target.user_id}
        targetRole={target.role as MemberRole}
        rows={perms.map((p) => ({
          slug: p.module.slug,
          name: p.module.name,
          icon: p.module.icon,
          access: p.access,
          roleDefault: p.module.defaults[target.role as MemberRole],
        }))}
      />
    </div>
  );
}
