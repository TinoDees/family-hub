"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/shopping", label: "Overview" },
  { href: "/shopping/lists", label: "Lists" },
  { href: "/shopping/pantry", label: "Pantry" },
];

export function ShoppingTabs() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/shopping") return pathname === "/shopping";
    if (href === "/shopping/lists")
      // list detail pages (/shopping/<uuid>) belong to the Lists tab
      return (
        pathname.startsWith("/shopping/lists") ||
        (pathname.startsWith("/shopping/") && !pathname.startsWith("/shopping/pantry"))
      );
    return pathname.startsWith(href);
  };
  return (
    <div className="mt-4 flex gap-1 border-b border-stone-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${
            isActive(t.href)
              ? "border-stone-900 text-stone-900"
              : "border-transparent text-stone-500 hover:text-stone-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
