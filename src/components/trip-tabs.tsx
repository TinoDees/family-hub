"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/holidays/${tripId}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/expenses`, label: "💸 Split the bill", exact: false },
    { href: `${base}/photos`, label: "📷 Photos", exact: false },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${
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
