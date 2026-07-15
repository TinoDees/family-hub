"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ModuleDef } from "@/lib/modules";
import { InstallButton } from "@/components/install-button";
import { RefreshButton } from "@/components/refresh-button";
import { BackButton } from "@/components/back-button";

function NavLinks({
  modules,
  isOwner,
  pathname,
}: {
  modules: ModuleDef[];
  isOwner: boolean;
  pathname: string;
}) {
  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-stone-900 text-white"
        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
    }`;

  return (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <Link href="/dashboard" className={linkCls(pathname === "/dashboard")}>
          <span>🏡</span> Dashboard
        </Link>
        <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Modules
        </div>
        {modules.map((m) => (
          <Link
            key={m.slug}
            href={m.href ?? `/${m.slug}`}
            className={linkCls(
              pathname === (m.href ?? `/${m.slug}`) ||
                pathname.startsWith(`${m.href ?? `/${m.slug}`}/`)
            )}
          >
            <span>{m.icon}</span> {m.name}
          </Link>
        ))}
      </nav>
      <div className="border-t border-stone-200 p-3">
        {isOwner && (
          <Link href="/settings" className={linkCls(pathname.startsWith("/settings"))}>
            <span>⚙️</span> Settings
          </Link>
        )}
        <Link href="/help" className={linkCls(pathname.startsWith("/help"))}>
          <span>❓</span> Help & guides
        </Link>
        <InstallButton />
      </div>
    </>
  );
}

function SidebarHeader({ householdName }: { householdName: string }) {
  return (
    <div className="border-b border-stone-200 px-4 py-4">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nestly-icon-192.png" alt="Nestly" className="h-8 w-8 rounded-lg" />
        <div>
          <div className="text-sm font-semibold leading-tight">Nestly</div>
          <div className="max-w-40 truncate text-xs text-stone-500">{householdName}</div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  modules,
  householdName,
  isOwner,
  userLabel,
  role,
  signOutAction,
  children,
}: {
  modules: ModuleDef[];
  householdName: string;
  isOwner: boolean;
  userLabel: string;
  role: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <SidebarHeader householdName={householdName} />
        <NavLinks modules={modules} isOwner={isOwner} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <SidebarHeader householdName={householdName} />
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-100"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <NavLinks modules={modules} isOwner={isOwner} pathname={pathname} />
            <div className="border-t border-stone-200 p-3 text-xs text-stone-400">
              {userLabel} · <span className="capitalize">{role}</span>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 md:px-6">
          <BackButton />
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm md:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="truncate text-sm font-semibold md:hidden">
            {householdName}
          </span>
          <div className="flex items-center gap-3">
            <RefreshButton />
            <span className="hidden text-sm text-stone-500 sm:inline">
              {userLabel}
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">
                {role}
              </span>
            </span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
