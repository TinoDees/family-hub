import Link from "next/link";
import { requireModule } from "@/lib/module-guard";

const SERVICES: Record<string, { name: string; links: { label: string; href: string }[]; blurb: string }> = {
  google: {
    name: "Google Family Link",
    blurb: "Screen time, app approval and location for Android devices — free, built into Android.",
    links: [
      { label: "Open Family Link", href: "https://families.google.com/families" },
      { label: "Set-up guide", href: "https://support.google.com/families/answer/7101025" },
    ],
  },
  apple: {
    name: "Apple Screen Time",
    blurb: "Downtime, app limits and content restrictions for iPhone and iPad, via Family Sharing.",
    links: [
      { label: "How to set up Screen Time", href: "https://support.apple.com/en-au/108806" },
      { label: "Family Sharing", href: "https://www.apple.com/au/family-sharing/" },
    ],
  },
  life360: {
    name: "Life360",
    blurb: "Family location sharing, driving safety and alerts.",
    links: [
      { label: "Open Life360", href: "https://app.life360.com" },
      { label: "Life360 website", href: "https://www.life360.com" },
    ],
  },
};

export default async function ParentalPage() {
  const { membership } = await requireModule("parental", "view");
  const chosen = (membership.household as unknown as { device_safety_service?: string | null }).device_safety_service;
  const service = chosen ? SERVICES[chosen] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🛡️ Parental Controls</h1>
        <p className="mt-1 text-sm text-stone-500">
          What kids can see and do inside Nestly, plus quick links to your device-safety service.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Inside Nestly</h2>
        <p className="mt-1 text-sm text-stone-600">
          Children get restricted access automatically — no Finance, no Settings, view-only
          recipes and planner. Fine-tune each child per module under{" "}
          <Link href="/settings/members" className="underline">Settings → Members → Permissions</Link>,
          and create email-free logins with{" "}
          <Link href="/settings/members" className="underline">child accounts</Link>.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold">On their devices</h2>
        {service ? (
          <>
            <p className="mt-1 text-sm text-stone-600">
              Your family uses <span className="font-medium">{service.name}</span> — {service.blurb}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {service.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-stone-600">
            Screen time and app limits live at the operating-system level — pick your family&apos;s
            service (Google Family Link, Apple Screen Time or Life360) in{" "}
            <Link href="/settings" className="underline">Settings → Household</Link> and its quick
            links will appear here.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-500">Coming soon</h2>
        <ul className="mt-2 space-y-1 text-sm text-stone-500">
          <li>• Family chat — message the kids inside Nestly (works on Wi-Fi-only devices)</li>
          <li>• Approval queue — kids request, parents approve</li>
          <li>• Screen-time windows for Nestly itself</li>
        </ul>
      </div>
    </div>
  );
}
