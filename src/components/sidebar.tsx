"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/lib/modules";

export function Sidebar({
  modules,
  householdName,
  isOwner,
}: {
  modules: ModuleDef[];
  householdName: string;
  isOwner: boolean;
}) {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-stone-900 text-white"
        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
    }`;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="text-sm font-semibold leading-tight">Family Hub</div>
            <div className="truncate text-xs text-stone-500">{householdName}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <Link href="/dashboard" className={linkCls(pathname === "/dashboard")}>
          <span>🏡</span> Dashboard
        </Link>
        <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Modules
        </div>
        {modules.map((m) => (
          <Link key={m.slug} href={`/${m.slug}`} className={linkCls(pathname === `/${m.slug}`)}>
            <span>{m.icon}</span> {m.name}
          </Link>
        ))}
      </nav>
      {isOwner && (
        <div className="border-t border-stone-200 p-3">
          <Link href="/settings" className={linkCls(pathname.startsWith("/settings"))}>
            <span>⚙️</span> Settings
          </Link>
        </div>
      )}
    </aside>
  );
}
