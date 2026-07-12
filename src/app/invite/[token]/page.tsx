import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { acceptInvite, acceptInviteNewUser } from "@/lib/actions/invites";
import { AuthCard, buttonCls, inputCls } from "@/components/auth-card";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite_by_token", { p_token: token });
  const invite = data?.[0];

  if (!invite) {
    return (
      <AuthCard title="Invite not found" subtitle="This invite link is not valid.">
        <p className="text-center text-sm text-stone-500">
          Ask the person who invited you to send a new link.
        </p>
      </AuthCard>
    );
  }

  if (invite.status !== "pending") {
    // Already a member (e.g. re-opening a used invite link)? Just go in.
    const membership = await getMembership();
    if (membership) {
      return (
        <AuthCard
          title={`Welcome to ${membership.household.name}`}
          message="You're already a member — no invite needed."
        >
          <Link href="/dashboard" className={`${buttonCls} block text-center`}>
            Go to Nestly
          </Link>
        </AuthCard>
      );
    }
    const reasons: Record<string, string> = {
      accepted: "This invite has already been used.",
      revoked: "This invite has been revoked.",
      expired: "This invite has expired.",
    };
    return (
      <AuthCard title={`Join ${invite.household_name}`} error={reasons[invite.status]}>
        <p className="text-center text-sm text-stone-500">
          Ask the person who invited you to send a new invite, or{" "}
          <Link href="/login" className="underline">sign in</Link> if you already have an account.
        </p>
      </AuthCard>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const nextPath = `/invite/${token}`;

  return (
    <AuthCard
      title={`Join ${invite.household_name}`}
      subtitle={`${invite.inviter_name} invited you (${invite.email}) to join as ${invite.role}.`}
      error={error}
    >
      {user ? (
        <form action={acceptInvite}>
          <input type="hidden" name="token" value={token} />
          <button className={buttonCls}>Join {invite.household_name}</button>
        </form>
      ) : (
        <div className="space-y-3">
          <form action={acceptInviteNewUser} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <input
              value={invite.email}
              disabled
              className={`${inputCls} bg-stone-50 text-stone-400`}
            />
            <input name="name" type="text" required placeholder="Your name" className={inputCls} />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Choose a password (min 8 characters)"
              className={inputCls}
            />
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              placeholder="Repeat password"
              className={inputCls}
            />
            <button className={buttonCls}>
              Set password & join {invite.household_name}
            </button>
          </form>
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-sm font-medium hover:bg-stone-100"
          >
            I already have an account
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
