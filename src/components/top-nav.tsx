"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ModuleDef } from "@/lib/modules";
import { InstallButton } from "@/components/install-button";

/**
 * Tracey-style top navigation, family-sized and Apple-simple:
 * one dark bar, big clear labels, Home first, everything one tap away.
 * WHAT appears here is decided by permissions; the ORDER by nav_prefs
 * (household default + personal) — see src/lib/nav.ts.
 */
export function TopNav({
  modules,
  householdName,
  isOwner,
  userLabel,
  role,
  signOutAction,
}: {
  modules: ModuleDef[];
  householdName: string;
  isOwner: boolean;
  userLabel: string;
  role: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false); // mobile panel
  const [userOpen, setUserOpen] = useState(false); // user dropdown
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const hrefFor = (m: ModuleDef) => m.href ?? `/${m.slug}`;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onHome = pathname === "/dashboard" || pathname === "/";

  const linkCls = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-white/15 font-medium text-white" : "text-stone-300 hover:bg-white/10 hover:text-white"
    }`;

  const initial = (userLabel.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="sticky top-0 z-40">
      <header className="bg-stone-900 text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 md:px-5">
          {/* Back (hidden on Home) */}
          {!onHome && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
              title="Back"
              aria-label="Back"
              className="rounded-lg px-2 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white"
            >
              ←
            </button>
          )}

          {/* Brand */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nestly-icon-192.png" alt="Nestly" className="h-8 w-8 rounded-lg" />
            <span className="hidden max-w-36 truncate text-sm font-semibold lg:inline">
              {householdName}
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="mx-1 [scrollbar-width:none] hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
            <Link href="/dashboard" className={linkCls(onHome)}>
              <span>🏡</span> Home
            </Link>
            {modules.map((m) => (
              <Link key={m.slug} href={hrefFor(m)} className={linkCls(isActive(hrefFor(m)))}>
                <span>{m.icon}</span> {m.name}
              </Link>
            ))}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* User menu */}
          <div className="relative shrink-0" ref={userRef}>
            <button
              type="button"
              onClick={() => setUserOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/10"
              aria-label="Your menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold">
                {initial}
              </span>
              <span className="hidden text-xs text-stone-300 sm:inline">▾</span>
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white text-stone-800 shadow-xl">
                <div className="border-b border-stone-100 px-4 py-3">
                  <div className="truncate text-sm font-semibold">{userLabel}</div>
                  <div className="text-xs capitalize text-stone-500">
                    {role} · {householdName}
                  </div>
                </div>
                <div className="py-1 text-sm">
                  <Link href="/menu" className="block px-4 py-2 hover:bg-stone-50">
                    🎛️ Customise my menu
                  </Link>
                  {isOwner && (
                    <Link href="/settings" className="block px-4 py-2 hover:bg-stone-50">
                      ⚙️ Settings
                    </Link>
                  )}
                  <Link href="/help" className="block px-4 py-2 hover:bg-stone-50">
                    ❓ Help & guides
                  </Link>
                  <div className="px-4 py-1">
                    <InstallButton />
                  </div>
                </div>
                <form action={signOutAction} className="border-t border-stone-100">
                  <button className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Mobile burger */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg px-2.5 py-1.5 text-lg hover:bg-white/10 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* Mobile panel: big friendly buttons */}
      {menuOpen && (
        <div className="border-b border-stone-200 bg-white shadow-lg md:hidden">
          <div className="grid grid-cols-3 gap-2 p-3">
            <Link
              href="/dashboard"
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                onHome ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <span className="text-2xl">🏡</span>
              <span className="text-xs font-medium">Home</span>
            </Link>
            {modules.map((m) => (
              <Link
                key={m.slug}
                href={hrefFor(m)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                  isActive(hrefFor(m))
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 hover:bg-stone-50"
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                <span className="text-xs font-medium leading-tight">{m.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
