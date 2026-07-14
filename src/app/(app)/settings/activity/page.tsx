import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  login: { label: "signed in", cls: "bg-emerald-100 text-emerald-700" },
  logout: { label: "signed out", cls: "bg-stone-100 text-stone-500" },
  user_signedup: { label: "created account", cls: "bg-sky-100 text-sky-700" },
  token_refreshed: { label: "active session", cls: "bg-stone-50 text-stone-400" },
};

export default async function ActivityPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const supabase = await createClient();
  const { data: activity } = await supabase.rpc("household_login_activity", {
    hid: membership.household_id,
  });

  // hide the noisy session refreshes by default; show sign-ins etc.
  const rows = ((activity ?? []) as { member_name: string; email: string; action: string; happened_at: string }[])
    .filter((a) => a.action !== "token_refreshed")
    .slice(0, 50);

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Sign-in activity for household members (and guests are visible on their trips&apos;
        expenses and photos). Times are your local time.
      </p>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((a, i) => {
              const meta = ACTION_LABEL[a.action] ?? { label: a.action, cls: "bg-stone-100 text-stone-500" };
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">{a.member_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>
                  <span className="ml-auto text-xs text-stone-400">
                    {new Date(a.happened_at).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-stone-400">
        A full &ldquo;what they did&rdquo; audit trail (per action) is on the roadmap — today you
        can see who created each expense, photo and recipe on the items themselves.
      </p>
    </div>
  );
}
