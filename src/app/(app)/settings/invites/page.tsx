import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { createInvite, deleteInvite, resendInvite } from "@/lib/actions/invites";
import { inputCls, buttonCls } from "@/components/auth-card";
import { CopyButton } from "@/components/copy-button";

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; emailed?: string }>;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const { error, created, emailed } = await searchParams;

  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, token, created_at, expires_at")
    .eq("household_id", membership.household_id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const pending = (invites ?? []).filter(
    (i) => new Date(i.expires_at) > new Date()
  );
  const expired = (invites ?? []).filter(
    (i) => new Date(i.expires_at) <= new Date()
  );

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {created && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {emailed === "1"
            ? "Invite sent — an email is on its way."
            : "Invite created — copy the link and send it via WhatsApp, SMS or however you like."}
        </p>
      )}

      <form
        action={createInvite}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-6"
      >
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input name="email" type="email" required placeholder="family.member@example.com" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            name="role"
            defaultValue="adult"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm capitalize"
          >
            <option value="adult">adult</option>
            <option value="child">child</option>
            <option value="owner">owner</option>
          </select>
        </div>
        <button className={`${buttonCls} w-auto px-6`}>Invite</button>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-stone-700">Waiting to join</h3>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          {pending.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-400">
              No open invites. Everyone who accepted is under Members.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((inv, i) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium">{inv.email}</td>
                    <td className="px-4 py-2.5 capitalize">{inv.role}</td>
                    <td className="px-4 py-2.5 text-stone-500">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <CopyButton path={`/invite/${inv.token}`} label="Copy link" />
                        <form action={resendInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
                            New link
                          </button>
                        </form>
                        <form action={deleteInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                            Cancel
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {expired.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-400">Expired</h3>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {expired.map((inv) => (
                  <tr key={inv.id} className="border-b border-stone-100 text-stone-400">
                    <td className="px-4 py-2.5">{inv.email}</td>
                    <td className="px-4 py-2.5 capitalize">{inv.role}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <form action={resendInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100">
                            Resend
                          </button>
                        </form>
                        <form action={deleteInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-400 hover:bg-stone-100">
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
