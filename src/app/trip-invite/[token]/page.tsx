import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptTripInvite } from "@/lib/actions/guest-trip";
import { AuthCard, buttonCls } from "@/components/auth-card";

export const dynamic = "force-dynamic";

export default async function TripInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_trip_invite", { p_token: token });
  const invite = data?.[0];

  if (!invite) {
    return (
      <AuthCard title="Invite not found" subtitle="This trip invite link is not valid.">
        <p className="text-center text-sm text-stone-500">Ask your friend to send a new link.</p>
      </AuthCard>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // already a participant (e.g. saved this page as a home-screen shortcut)? straight in.
  if (user) {
    const { data: mine } = await supabase
      .from("trip_participants")
      .select("trip_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (mine) redirect(`/guest/${mine.trip_id}`);
  }

  if (invite.status !== "pending") {
    const reasons: Record<string, string> = {
      accepted: "This invite has already been used.",
      claimed: "This spot has already been claimed.",
      revoked: "This invite has been revoked.",
      expired: "This invite has expired.",
    };
    return (
      <AuthCard title={`Join "${invite.trip_name}"`} error={reasons[invite.status]}>
        <p className="text-center text-sm text-stone-500">
          {user ? (
            <Link href="/" className="underline">Go to Nestly</Link>
          ) : (
            <>Already claimed your spot? <Link href="/login" className="underline">Sign in</Link>.</>
          )}
        </p>
      </AuthCard>
    );
  }

  const nextPath = `/trip-invite/${token}`;

  return (
    <AuthCard
      title={`Join "${invite.trip_name}"`}
      subtitle={`${invite.household_name} invited you (${invite.participant_name}) to track shared trip expenses together.`}
      error={error}
    >
      {user ? (
        <form action={acceptTripInvite}>
          <input type="hidden" name="token" value={token} />
          <button className={buttonCls}>Join as {invite.participant_name}</button>
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
          <p className="text-center text-xs text-stone-400">
            You&apos;ll only see this trip — nothing else from {invite.household_name}.
          </p>
        </div>
      )}
    </AuthCard>
  );
}
