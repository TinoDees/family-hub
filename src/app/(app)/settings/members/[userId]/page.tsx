import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions } from "@/lib/permissions";
import { resetPermissions } from "@/lib/actions/members";
import {
  adminSetPassword,
  adminSetBlocked,
  adminDeleteUser,
  getAccountInfo,
} from "@/lib/actions/admin-users";
import { PermissionMatrix } from "@/components/permission-matrix";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { inputCls } from "@/components/auth-card";
import type { MemberRole } from "@/lib/modules";

export default async function MemberPermissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { userId } = await params;
  const { saved, error } = await searchParams;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("household_members")
    .select("user_id, role, display_name")
    .eq("household_id", membership.household_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSelf = user?.id === target.user_id;

  const [perms, account] = await Promise.all([
    getPermissions(membership.household_id, target.user_id, target.role as MemberRole),
    getAccountInfo(target.user_id),
  ]);

  return (
    <div className="space-y-6">
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
            {account.blocked && (
              <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                blocked
              </span>
            )}
          </h2>
          {account.email && (
            <p className="text-sm text-stone-500">
              {account.email}
              {account.lastSignIn && (
                <span className="ml-2 text-xs text-stone-400">
                  last sign-in {new Date(account.lastSignIn).toLocaleString()}
                </span>
              )}
            </p>
          )}
        </div>
        <form action={resetPermissions}>
          <input type="hidden" name="user_id" value={target.user_id} />
          <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
            Reset to role defaults
          </button>
        </form>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saved}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h3 className="text-sm font-semibold">Account</h3>
        {!account.available ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Account management (set password, block, delete) needs the
            SUPABASE_SERVICE_ROLE_KEY environment variable. Add it in Vercel and
            .env.local, then redeploy.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            <form action={adminSetPassword} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="user_id" value={target.user_id} />
              <div className="min-w-64 flex-1">
                <label className="mb-1 block text-sm font-medium">Set a new password</label>
                <input
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="Temporary password (min 8 characters)"
                  className={inputCls}
                />
              </div>
              <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
                Set password
              </button>
            </form>
            <p className="-mt-3 text-xs text-stone-400">
              Use this when someone forgot their password — tell them the new one and
              they can keep using it or change it later.
            </p>

            {!isSelf && (
              <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
                <form action={adminSetBlocked}>
                  <input type="hidden" name="user_id" value={target.user_id} />
                  <input type="hidden" name="block" value={account.blocked ? "0" : "1"} />
                  <button
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                      account.blocked
                        ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        : "border-amber-300 text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {account.blocked ? "Unblock — allow sign-in" : "Block — prevent sign-in"}
                  </button>
                </form>
                <form action={adminDeleteUser}>
                  <input type="hidden" name="user_id" value={target.user_id} />
                  <ConfirmSubmit
                    label="Delete account"
                    confirmMessage={`Permanently delete ${target.display_name ?? "this member"}'s account? This removes them from the household and deletes their login. It cannot be undone.`}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  />
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
