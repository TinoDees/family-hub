import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { createInvite, revokeInvite, resendInvite } from "@/lib/actions/invites";
import { inputCls, buttonCls } from "@/components/auth-card";
import { CopyButton } from "@/components/copy-button";

function inviteStatus(i: {
  revoked_at: string | null;
  accepted_at: string | null;
  expires_at: string;
}) {
  if (i.revoked_at) return "revoked";
  if (i.accepted_at) return "accepted";
  if (new Date(i.expires_at) < new Date()) return "expired";
  return "pending";
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-sky-100 text-sky-700",
  accepted: "bg-emerald-100 text-emerald-700",
  expired: "bg-stone-100 text-stone-500",
  revoked: "bg-red-100 text-red-600",
};

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
    .select("id, email, role, token, created_at, expires_at, accepted_at, revoked_at")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {created && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Invite created.{" "}
          {emailed === "1"
            ? "An email is on its way."
            : "Email sending isn't configured yet — copy the link below and send it yourself (WhatsApp, SMS, anything)."}
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

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Expires</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(invites ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  No invites yet.
                </td>
              </tr>
            )}
            {(invites ?? []).map((inv, i) => {
              const status = inviteStatus(inv);
              return (
                <tr
                  key={inv.id}
                  className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium">{inv.email}</td>
                  <td className="px-4 py-2.5 capitalize">{inv.role}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[status]}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      {status === "pending" && (
                        <CopyButton path={`/invite/${inv.token}`} label="Copy link" />
                      )}
                      {status !== "accepted" && (
                        <form action={resendInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
                            {status === "pending" ? "New link" : "Resend"}
                          </button>
                        </form>
                      )}
                      {status === "pending" && (
                        <form action={revokeInvite}>
                          <input type="hidden" name="invite_id" value={inv.id} />
                          <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                            Revoke
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
