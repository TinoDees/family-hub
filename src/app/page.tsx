import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getMembership();
  if (membership) redirect("/dashboard");

  // no household — maybe a trip guest?
  const { data: participation } = await supabase
    .from("trip_participants")
    .select("trip_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (participation) redirect(`/guest/${participation.trip_id}`);

  redirect("/onboarding");
}
