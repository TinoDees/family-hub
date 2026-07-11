import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { createHousehold, joinHousehold } from "@/lib/actions/household";
import { signOut } from "@/lib/actions/auth";
import { AuthCard, inputCls, buttonCls } from "@/components/auth-card";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await getMembership()) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <AuthCard title="Set up your household" subtitle="Create a new one, or join with an invite code" error={error}>
      <form action={createHousehold} className="space-y-3">
        <input name="name" type="text" required placeholder="Household name (e.g. The Dees Family)" className={inputCls} />
        <button className={buttonCls}>Create household</button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-stone-200" /> OR <div className="h-px flex-1 bg-stone-200" />
      </div>

      <form action={joinHousehold} className="space-y-3">
        <input name="code" type="text" required placeholder="Invite code" className={inputCls} />
        <button className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100">
          Join household
        </button>
      </form>

      <form action={signOut} className="mt-6 text-center">
        <button className="text-xs text-stone-400 underline">Sign out</button>
      </form>
    </AuthCard>
  );
}
