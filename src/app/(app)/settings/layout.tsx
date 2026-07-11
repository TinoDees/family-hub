import { redirect } from "next/navigation";
import { getMembership } from "@/lib/household";
import { SettingsTabs } from "@/components/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  if (membership.role !== "owner") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-stone-500">
        Manage {membership.household.name} — members, invites and permissions.
      </p>
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
