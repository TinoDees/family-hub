"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavNode, NavItem, NavGroup } from "@/lib/nav-catalog";
import { InstallButton } from "@/components/install-button";

/**
 * Tracey-style top navigation, family-sized and Apple-simple:
 * one dark bar, big clear labels, Home first, everything one tap away.
 * WHAT appears here is decided by permissions; HOW it's arranged (order,
 * grouping under "Label ▾" menus with sub-menu sections, hiding) by the
 * resolved nav tree from nav_prefs — see src/lib/nav.ts + nav-catalog.ts.
 */
export function TopNav({
  modules,
  householdName,
  isOwner,
  userLabel,
  role,
  signOutAction,
}: {
  modules: NavNode[];
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
  const [openGroup, setOpenGroup] = useState<{ id: string; left: number; top: number } | null>(null);
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setUserOpen(false);
    setOpenGroup(null);
    setOpenMobileGroup(null);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groupActive = (g: NavGroup) => g.sections.some((s) => s.items.some((it) => isActive(it.href)));
  const onHome = pathname === "/dashboard" || pathname === "/";

  const linkCls = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-white/15 font-medium text-white" : "text-stone-300 hover:bg-white/10 hover:text-white"
    }`;

  const toggleGroup = (g: NavGroup, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openGroup?.id === g.id) {
      setOpenGroup(null);
      return;
    }
    // The bar scrolls horizontally, so the panel is position:fixed (escapes the
    // overflow clip); anchor it to the button and clamp to the viewport.
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenGroup({
      id: g.id,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
      top: rect.bottom + 6,
    });
  };

  const dropdownItem = (it: NavItem) => (
    <Link
      key={it.slug}
      href={it.href}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm hover:bg-stone-50 ${
        isActive(it.href) ? "font-semibold text-teal-700" : "text-stone-800"
      }`}
    >
      <span>{it.icon}</span> {it.label}
    </Link>
  );

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

          {/* Desktop links + group dropdowns */}
          <nav ref={navRef} className="mx-1 [scrollbar-width:none] hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
            <Link href="/dashboard" className={linkCls(onHome)}>
              <span>🏡</span> Home
            </Link>
            {modules.map((node) =>
              node.kind === "link" ? (
                <Link key={node.slug} href={node.href} className={linkCls(isActive(node.href))}>
                  <span>{node.icon}</span> {node.label}
                </Link>
              ) : (
                <div key={node.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={(e) => toggleGroup(node, e)}
                    className={linkCls(groupActive(node) || openGroup?.id === node.id)}
                    aria-expanded={openGroup?.id === node.id}
                  >
                    {node.label} <span className="text-[0.6rem] opacity-70">▾</span>
                  </button>
                  {openGroup?.id === node.id && (
                    <div
                      className="fixed z-50 flex max-w-[calc(100vw-1rem)] gap-4 overflow-x-auto rounded-xl border border-stone-200 bg-white p-2.5 text-stone-800 shadow-xl"
                      style={{ left: openGroup.left, top: openGroup.top }}
                    >
                      {node.sections.map((s, i) => (
                        <div key={i} className="min-w-40">
                          {s.title && (
                            <div className="px-2.5 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-stone-400">
                              {s.title}
                            </div>
                          )}
                          {s.items.map(dropdownItem)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
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

      {/* Mobile panel: Tracey-style full-screen accordion list */}
      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-white md:hidden">
          <nav className="divide-y divide-stone-100">
            <Link
              href="/dashboard"
              className={`block px-5 py-4 text-base font-semibold ${onHome ? "text-teal-700" : "text-stone-900"}`}
            >
              🏡 Home
            </Link>
            {modules.map((node) =>
              node.kind === "link" ? (
                <Link
                  key={node.slug}
                  href={node.href}
                  className={`block px-5 py-4 text-base font-semibold ${
                    isActive(node.href) ? "text-teal-700" : "text-stone-900"
                  }`}
                >
                  {node.icon} {node.label}
                </Link>
              ) : (
                <div key={node.id}>
                  <button
                    type="button"
                    onClick={() => setOpenMobileGroup((o) => (o === node.id ? null : node.id))}
                    className={`flex w-full items-center justify-between px-5 py-4 text-left text-base font-semibold ${
                      groupActive(node) || openMobileGroup === node.id ? "text-teal-700" : "text-stone-900"
                    }`}
                    aria-expanded={openMobileGroup === node.id}
                  >
                    {node.label}
                    <span className="text-xs text-stone-400">
                      {openMobileGroup === node.id ? "▲" : "▼"}
                    </span>
                  </button>
                  {openMobileGroup === node.id && (
                    <div className="divide-y divide-stone-50 border-t border-stone-100 pb-1">
                      {node.sections.map((sec, i) => (
                        <div key={i}>
                          {sec.title && (
                            <div className="px-8 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide text-stone-400">
                              {sec.title}
                            </div>
                          )}
                          {sec.items.map((it) => (
                            <Link
                              key={it.slug}
                              href={it.href}
                              className={`block px-8 py-3.5 text-[15px] ${
                                isActive(it.href)
                                  ? "bg-teal-50 font-semibold text-teal-700"
                                  : "text-stone-700"
                              }`}
                            >
                              {it.label}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </nav>

          {/* Bottom: who you are + quick actions, like Tracey */}
          <div className="border-t-4 border-stone-100 px-5 py-4">
            <div className="text-sm font-semibold">{householdName}</div>
            <div className="mb-3 text-xs text-stone-500">
              {userLabel} · <span className="capitalize">{role}</span>
            </div>
            <div className="space-y-2">
              <Link
                href="/menu"
                className="block rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium hover:bg-stone-50"
              >
                🎛️ Customise navigation
              </Link>
              {isOwner && (
                <Link
                  href="/settings"
                  className="block rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium hover:bg-stone-50"
                >
                  ⚙️ Settings
                </Link>
              )}
              <Link
                href="/help"
                className="block rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium hover:bg-stone-50"
              >
                ❓ Help & guides
              </Link>
              <InstallButton />
              <form action={signOutAction}>
                <button className="block w-full rounded-xl border border-red-200 px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
