import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getIosShortcutUrl } from "@/lib/actions/device-setup";
import { DeviceSetup } from "@/components/device-setup";

/**
 * Device-aware "Set up your phone" step — the last stop after creating or
 * joining a household (and reachable any time, e.g. via the dashboard nudge
 * or the desktop QR code). All the platform branching happens client-side
 * in <DeviceSetup />, because only the browser knows what device it is.
 */
export default async function SetupDevicePage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shortcutUrl = await getIosShortcutUrl();

  return <DeviceSetup shortcutUrl={shortcutUrl} />;
}
