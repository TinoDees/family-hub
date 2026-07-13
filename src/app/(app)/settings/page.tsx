import { redirect } from "next/navigation";
import { getMembership } from "@/lib/household";
import { updateHousehold } from "@/lib/actions/settings";
import { inputCls, buttonCls } from "@/components/auth-card";
import { CopyButton } from "@/components/copy-button";

export default async function HouseholdSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { error, saved } = await searchParams;

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved.
        </p>
      )}

      <form
        action={updateHousehold}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Household name</label>
          <input
            name="name"
            defaultValue={membership.household.name}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Base currency</label>
          <input
            name="base_currency"
            defaultValue={membership.household.base_currency}
            maxLength={3}
            className={`${inputCls} w-24 font-mono uppercase`}
          />
          <p className="mt-1 text-xs text-stone-400">
            3-letter code, e.g. AUD. All Finance amounts convert to this.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Auto-delete receipt scans after</label>
          <div className="flex items-center gap-2">
            <input
              name="receipt_retention_days"
              type="number"
              min="1"
              defaultValue={(membership.household as unknown as { receipt_retention_days?: number | null }).receipt_retention_days ?? ""}
              placeholder="—"
              className={`${inputCls} w-24`}
            />
            <span className="text-sm text-stone-500">days</span>
          </div>
          <p className="mt-1 text-xs text-stone-400">
            Keeps storage small — trip receipts older than this are deleted nightly.
            Leave empty to keep receipts forever.
          </p>
        </div>
        <button className={`${buttonCls} w-auto px-6`}>Save</button>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="text-sm font-medium">Invite code (legacy)</div>
        <p className="mt-1 text-sm text-stone-500">
          Anyone with this code can join as an adult via the onboarding page.
          Prefer email invites (Invites tab) — they carry a role and expire.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="rounded bg-stone-100 px-3 py-1.5 font-mono text-sm">
            {membership.household.invite_code}
          </code>
          <CopyButton text={membership.household.invite_code} label="Copy code" />
        </div>
      </div>
    </div>
  );
}
