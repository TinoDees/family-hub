import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, visibleModules } from "@/lib/permissions";

export default async function DashboardPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perms = await getPermissions(
    membership.household_id,
    user!.id,
    membership.role
  );
  const visible = visibleModules(perms);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">{membership.household.name}</h1>
      {membership.role === "owner" && (
        <p className="mt-1 text-sm text-stone-500">
          Invite your family from{" "}
          <Link href="/settings/invites" className="underline">
            Settings → Invites
          </Link>
          .
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ module: m, access }) => (
          <Link
            key={m.slug}
            href={`/${m.slug}`}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="text-2xl">{m.icon}</div>
              {access === "view" && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                  view only
                </span>
              )}
            </div>
            <div className="mt-2 font-medium">{m.name}</div>
            <div className="mt-1 text-sm text-stone-500">{m.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
