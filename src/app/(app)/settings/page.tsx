import { redirect } from "next/navigation";
import { getMembership } from "@/lib/household";
import { updateHousehold, updateDeviceLock } from "@/lib/actions/settings";
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
        <div>
          <label className="mb-1 block text-sm font-medium">Device safety service</label>
          <select
            name="device_safety_service"
            defaultValue={(membership.household as unknown as { device_safety_service?: string | null }).device_safety_service ?? ""}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            <option value="google">Google Family Link (Android)</option>
            <option value="apple">Apple Screen Time (iPhone/iPad)</option>
            <option value="life360">Life360</option>
          </select>
          <p className="mt-1 text-xs text-stone-400">
            Shown as quick links on the Parental Controls page — Nestly manages what kids see
            in the app; these services manage the devices themselves.
          </p>
        </div>
        <button className={`${buttonCls} w-auto px-6`}>Save</button>
      </form>

      <form
        action={updateDeviceLock}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"
      >
        <div>
          <div className="text-sm font-medium">Device lock</div>
          <p className="mt-1 text-sm text-stone-500">
            For shared tablets and phones: after some quiet time the screen locks and the
            signed-in person resumes with their PIN (set under Account → Security). Overnight
            everyone is fully signed out for a clean slate each morning.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="idle_lock_enabled"
            defaultChecked={membership.household.idle_lock_enabled}
            className="h-4 w-4 rounded border-stone-300"
          />
          Lock the screen when idle
        </label>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Lock after</label>
            <div className="flex items-center gap-2">
              <input
                name="idle_lock_minutes"
                type="number"
                min="1"
                max="240"
                defaultValue={membership.household.idle_lock_minutes ?? 30}
                className={`${inputCls} w-24`}
              />
              <span className="text-sm text-stone-500">minutes idle</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Overnight sign-out at</label>
            <input
              name="overnight_logout_at"
              type="time"
              defaultValue={(membership.household.overnight_logout_at ?? "00:00").slice(0, 5)}
              className={`${inputCls} w-32`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Timezone</label>
            <input
              name="timezone"
              defaultValue={membership.household.timezone ?? "Australia/Sydney"}
              className={`${inputCls} w-56`}
            />
            <p className="mt-1 text-xs text-stone-400">e.g. Australia/Sydney</p>
          </div>
        </div>
        <button className={`${buttonCls} w-auto px-6`}>Save device lock</button>
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
