import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/actions/invites";
import { AuthCard, buttonCls } from "@/components/auth-card";

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
    const reasons: Record<string, string> = {
      accepted: "This invite has already been used.",
      revoked: "This invite has been revoked.",
      expired: "This invite has expired.",
    };
    return (
      <AuthCard title={`Join ${invite.household_name}`} error={reasons[invite.status]}>
        <p className="text-center text-sm text-stone-500">
          Ask the person who invited you to send a new invite.
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
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className={`${buttonCls} block text-center`}
          >
            Create an account to join
          </Link>
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
