import { createAdminClient } from "@/lib/supabase/admin";
import { createCampaign, toggleCampaign, deleteCampaign } from "./actions";

export const dynamic = "force-dynamic";

type Campaign = {
  id: string;
  name: string;
  channel: string | null;
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string;
  monthly_budget: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type Row = {
  key: string;
  name: string;
  channel: string;
  url: string | null;
  budget: number | null;
  active: boolean;
  id: string | null;
  visits30: number;
  visitors30: number;
  signups30: number;
  signupsAll: number;
  activated: number;
  premium: number;
};

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

function pct(n: number, d: number) {
  if (!d) return "–";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

export default async function AdminMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const db = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [campaignsRes, events30Res, attribRes, membersRes, plansRes, accountsRes] =
    await Promise.all([
      db
        .from("marketing_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      db
        .from("analytics_events")
        .select("session_id, utm_source, utm_campaign")
        .eq("event", "page_view")
        .gte("ts", since30),
      db.from("signup_attributions").select("*"),
      db.from("household_members").select("user_id, household_id"),
      db.from("household_plans").select("household_id, plan"),
      db.from("finance_accounts").select("id, household_id"),
    ]);

  const campaigns = (campaignsRes.data ?? []) as Campaign[];
  const events = events30Res.data ?? [];
  const attribs = attribRes.data ?? [];
  const members = membersRes.data ?? [];
  const plans = plansRes.data ?? [];
  const accounts = accountsRes.data ?? [];

  // Lookups: user -> household, household -> member count / has account / plan.
  const userHousehold = new Map<string, string>();
  const householdSize = new Map<string, number>();
  for (const m of members) {
    userHousehold.set(m.user_id, m.household_id);
    householdSize.set(m.household_id, (householdSize.get(m.household_id) ?? 0) + 1);
  }
  const householdsWithAccount = new Set(accounts.map((a) => a.household_id));
  const premiumHouseholds = new Set(
    plans.filter((p) => p.plan === "premium").map((p) => p.household_id)
  );

  const matches = (
    row: { utm_source: string | null; utm_campaign: string | null },
    c: Campaign
  ) => row.utm_source === c.utm_source && row.utm_campaign === c.utm_campaign;

  const statsFor = (c: Campaign | null): Omit<Row, "key" | "name" | "channel" | "url" | "budget" | "active" | "id"> => {
    const ev = events.filter((e) =>
      c ? matches(e, c) : !e.utm_source
    );
    const at = attribs.filter((a) => (c ? matches(a, c) : !a.utm_source));
    const at30 = at.filter((a) => a.created_at >= since30);
    let activated = 0;
    let premium = 0;
    for (const a of at) {
      const hh = userHousehold.get(a.user_id);
      if (!hh) continue;
      if ((householdSize.get(hh) ?? 0) >= 2 || householdsWithAccount.has(hh))
        activated++;
      if (premiumHouseholds.has(hh)) premium++;
    }
    return {
      visits30: ev.length,
      visitors30: new Set(ev.map((e) => e.session_id).filter(Boolean)).size,
      signups30: at30.length,
      signupsAll: at.length,
      activated,
      premium,
    };
  };

  const rows: Row[] = campaigns.map((c) => ({
    key: c.id,
    name: c.name,
    channel: c.channel ?? "other",
    url: `https://nestlyapp.co/tour?utm_source=${c.utm_source}${
      c.utm_medium ? `&utm_medium=${c.utm_medium}` : ""
    }&utm_campaign=${c.utm_campaign}`,
    budget: c.monthly_budget,
    active: c.active,
    id: c.id,
    ...statsFor(c),
  }));
  rows.push({
    key: "organic",
    name: "Organic / direct (no campaign tag)",
    channel: "organic",
    url: null,
    budget: null,
    active: true,
    id: null,
    ...statsFor(null),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Marketing</h1>
      <p className="mt-1 text-sm text-stone-500">
        Create a campaign, put its link in the ad, then watch it here: visits,
        signups, activated households (invited someone or connected an account)
        and premium conversions. Attribution is first touch, 30 days, first
        party only.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-700">
          {message}
        </div>
      )}

      {/* Results */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-xs text-white">
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 text-right font-medium">Budget $/mo</th>
              <th className="px-3 py-2 text-right font-medium">Visits 30d</th>
              <th className="px-3 py-2 text-right font-medium">Visitors 30d</th>
              <th className="px-3 py-2 text-right font-medium">Signups 30d</th>
              <th className="px-3 py-2 text-right font-medium">Signups all</th>
              <th className="px-3 py-2 text-right font-medium">Visit→Signup</th>
              <th className="px-3 py-2 text-right font-medium">Activated</th>
              <th className="px-3 py-2 text-right font-medium">Premium</th>
              <th className="px-3 py-2 text-right font-medium">$ / signup 30d</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className={`border-b border-stone-100 last:border-0 ${r.active ? "" : "opacity-50"}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  {r.url && (
                    <div className="mt-0.5 max-w-[280px] truncate font-mono text-[11px] text-stone-400">
                      {r.url}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 capitalize">{r.channel}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.budget ?? "–"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.visits30}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.visitors30}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.signups30}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.signupsAll}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pct(r.signups30, r.visitors30)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.activated}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.premium}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.budget && r.signups30
                    ? `$${Math.round(r.budget / r.signups30)}`
                    : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.id && (
                    <div className="flex gap-2">
                      <form action={toggleCampaign}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={String(r.active)} />
                        <button className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">
                          {r.active ? "Pause" : "Resume"}
                        </button>
                      </form>
                      <form action={deleteCampaign}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New campaign */}
      <div className="mt-8 max-w-2xl rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold">New campaign</h2>
        <p className="mt-1 text-xs text-stone-500">
          The campaign link is built for you from source + campaign. Use that
          exact link in the ad or post; matching is on utm_source and
          utm_campaign.
        </p>
        <form action={createCampaign} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Name, e.g. Meta Reels July" className={inputCls} />
          <select name="channel" className={inputCls} defaultValue="meta">
            <option value="meta">Meta (Facebook/Instagram)</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
            <option value="youtube">YouTube</option>
            <option value="influencer">Influencer</option>
            <option value="other">Other</option>
          </select>
          <input name="utm_source" placeholder="utm_source, e.g. meta" className={inputCls} />
          <input name="utm_medium" placeholder="utm_medium, e.g. paid-social" className={inputCls} />
          <input name="utm_campaign" placeholder="utm_campaign, e.g. reels-july" className={inputCls} />
          <input name="monthly_budget" type="number" step="1" min="0" placeholder="Monthly budget AUD (optional)" className={inputCls} />
          <textarea name="notes" placeholder="Notes (optional)" className={`${inputCls} sm:col-span-2`} rows={2} />
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Create campaign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
