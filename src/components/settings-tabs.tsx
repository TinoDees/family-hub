"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Household", ownerOnly: true },
  { href: "/settings/members", label: "People", ownerOnly: false },
  { href: "/settings/invites", label: "Invites", ownerOnly: false },
  { href: "/settings/activity", label: "Activity", ownerOnly: true },
];

export function SettingsTabs({ isOwner = true }: { isOwner?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mt-6 flex gap-1 border-b border-stone-200">
      {TABS.filter((t) => isOwner || !t.ownerOnly).map((t) => {
        const active =
          t.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${
              active
                ? "border-stone-900 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
