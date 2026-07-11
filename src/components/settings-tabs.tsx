"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Household" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/invites", label: "Invites" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-6 flex gap-1 border-b border-stone-200">
      {TABS.map((t) => {
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
