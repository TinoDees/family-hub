/**
 * Navigation catalog + resolver (ported from Tracey's nav-catalog, family-sized).
 *
 * The item catalog is MODULES (src/lib/modules.ts) — one nav item per module.
 * A saved layout (nav_prefs.layout jsonb) can ARRANGE those items: reorder them,
 * hide them, group them under named menus with optional sub-menu sections.
 * With no layout saved the default is every module as its own top-level link,
 * so nothing changes for anyone until they customise.
 *
 * Scopes: the household default row (user_id null) is the family's layout; a
 * member's personal row REPLACES it wholesale for that member.
 *
 * A layout only arranges — WHO can open what is decided by the permission
 * resolver (src/lib/permissions.ts), and those access gates are applied ON TOP
 * of the layout in resolveNav, so a layout can never expose a module that
 * permissions removed.
 */

import { MODULES, getModule } from "@/lib/modules";

// ── Saved layout shape (nav_prefs.layout, v2) ────────────────────────────────
export type NavLayoutItem = { slug: string; hidden?: boolean };
export type NavLayoutSection = { title: string | null; items: NavLayoutItem[] };
export type NavLayoutGroup =
  | { type: "link"; slug: string; hidden?: boolean }
  | { type: "menu"; id: string; label: string; hidden?: boolean; sections: NavLayoutSection[] };
export type NavLayout = { v: 2; groups: NavLayoutGroup[] };

/** Legacy (v1) shape — the old up/down editor stored a flat array. */
export type LegacyNavPref = { slug: string; hidden?: boolean };

const MAX_GROUPS = 40;
const MAX_SECTIONS = 12;
const MAX_LABEL = 40;

export const hrefFor = (slug: string): string => getModule(slug)?.href ?? `/${slug}`;

export function newMenuId(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The built-in default: every module as its own top-level direct link. */
export function defaultLayout(): NavLayout {
  return { v: 2, groups: MODULES.map((m) => ({ type: "link" as const, slug: m.slug })) };
}

const cleanLabel = (v: unknown, fallback: string): string => {
  const s = typeof v === "string" ? v.trim().slice(0, MAX_LABEL) : "";
  return s || fallback;
};

/**
 * Parse + sanitise a raw layout (from the DB or from a save request).
 * Accepts the v2 tree AND the legacy v1 flat array (converted to all-links).
 * Unknown slugs and junk fields are stripped, duplicates deduped (first
 * placement wins), sizes capped. Returns null when unusable — callers then
 * fall back to the next scope / the default.
 */
export function parseLayout(raw: unknown): NavLayout | null {
  if (!raw || typeof raw !== "object") return null;

  const seen = new Set<string>();
  const takeItem = (v: unknown): NavLayoutItem | null => {
    if (!v || typeof v !== "object") return null;
    const slug = (v as { slug?: unknown }).slug;
    if (typeof slug !== "string" || !getModule(slug) || seen.has(slug)) return null;
    seen.add(slug);
    return { slug, hidden: Boolean((v as { hidden?: unknown }).hidden) };
  };

  // Legacy v1: flat array of { slug, hidden } → all top-level links, order kept.
  if (Array.isArray(raw)) {
    const groups: NavLayoutGroup[] = [];
    for (const p of raw.slice(0, MAX_GROUPS)) {
      const it = takeItem(p);
      if (it) groups.push({ type: "link", slug: it.slug, hidden: it.hidden });
    }
    return groups.length ? { v: 2, groups } : null;
  }

  const rawGroups = (raw as { groups?: unknown }).groups;
  if (!Array.isArray(rawGroups)) return null;

  const groups: NavLayoutGroup[] = [];
  for (const g of rawGroups.slice(0, MAX_GROUPS)) {
    if (!g || typeof g !== "object") continue;
    const type = (g as { type?: unknown }).type;
    if (type === "link") {
      const it = takeItem(g);
      if (it) groups.push({ type: "link", slug: it.slug, hidden: it.hidden });
      continue;
    }
    if (type !== "menu") continue;
    const rawSections = (g as { sections?: unknown }).sections;
    const sections: NavLayoutSection[] = [];
    if (Array.isArray(rawSections)) {
      for (const s of rawSections.slice(0, MAX_SECTIONS)) {
        if (!s || typeof s !== "object") continue;
        const rawTitle = (s as { title?: unknown }).title;
        const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, MAX_LABEL) : null;
        const rawItems = (s as { items?: unknown }).items;
        const items: NavLayoutItem[] = [];
        if (Array.isArray(rawItems)) for (const v of rawItems) { const it = takeItem(v); if (it) items.push(it); }
        sections.push({ title, items });
      }
    }
    if (sections.length === 0) sections.push({ title: null, items: [] });
    const rawId = (g as { id?: unknown }).id;
    groups.push({
      type: "menu",
      id: typeof rawId === "string" && rawId ? rawId.slice(0, 24) : newMenuId(),
      label: cleanLabel((g as { label?: unknown }).label, "Menu"),
      hidden: Boolean((g as { hidden?: unknown }).hidden),
      sections,
    });
  }
  return groups.length ? { v: 2, groups } : null;
}

/**
 * Reconcile a layout with the current MODULES catalog: drop unknown slugs,
 * dedupe, and append any module not placed anywhere as a top-level link at the
 * end — so the catalog can grow safely under old saved layouts. Empty menus
 * are kept (the editor shows them; the resolver drops them).
 */
export function reconcileLayout(layout: NavLayout | null): NavLayout {
  const base = layout ?? defaultLayout();
  const seen = new Set<string>();
  const groups: NavLayoutGroup[] = [];
  for (const g of base.groups) {
    if (g.type === "link") {
      if (!getModule(g.slug) || seen.has(g.slug)) continue;
      seen.add(g.slug);
      groups.push({ type: "link", slug: g.slug, hidden: g.hidden });
    } else {
      const sections = g.sections.map((s) => ({
        title: s.title,
        items: s.items.filter((i) => {
          if (!getModule(i.slug) || seen.has(i.slug)) return false;
          seen.add(i.slug);
          return true;
        }).map((i) => ({ slug: i.slug, hidden: i.hidden })),
      }));
      groups.push({ type: "menu", id: g.id, label: g.label, hidden: g.hidden, sections });
    }
  }
  for (const m of MODULES) if (!seen.has(m.slug)) groups.push({ type: "link", slug: m.slug });
  return { v: 2, groups };
}

// ── Render tree (consumed by TopNav) ─────────────────────────────────────────
export type NavItem = { slug: string; label: string; icon: string; href: string };
export type NavLink = { kind: "link" } & NavItem;
export type NavGroupSection = { title: string | null; items: NavItem[] };
export type NavGroup = { kind: "group"; id: string; label: string; sections: NavGroupSection[] };
export type NavNode = NavLink | NavGroup;

/**
 * The resolver: personal layout (if any) else household layout else default,
 * reconciled with the catalog, then ACCESS-GATED on top — only slugs in
 * allowedSlugs render, exactly like Tracey. Hidden items/groups are dropped;
 * a group whose items are all gone is dropped; a group left with exactly one
 * visible item renders as a direct link.
 */
export function resolveNav(
  household: NavLayout | null,
  personal: NavLayout | null,
  allowedSlugs: string[]
): NavNode[] {
  const layout = reconcileLayout(personal ?? household);
  const allowed = new Set(allowedSlugs);
  const toItem = (slug: string): NavItem | null => {
    const m = getModule(slug);
    if (!m || !allowed.has(slug)) return null;
    return { slug, label: m.name, icon: m.icon, href: hrefFor(slug) };
  };
  const out: NavNode[] = [];
  for (const g of layout.groups) {
    if (g.hidden) continue;
    if (g.type === "link") {
      const it = toItem(g.slug);
      if (it) out.push({ kind: "link", ...it });
      continue;
    }
    const sections: NavGroupSection[] = [];
    for (const s of g.sections) {
      const items = s.items
        .filter((i) => !i.hidden)
        .map((i) => toItem(i.slug))
        .filter((i): i is NavItem => i !== null);
      if (items.length) sections.push({ title: s.title, items });
    }
    const flat = sections.flatMap((s) => s.items);
    if (flat.length === 0) continue;               // all hidden/inaccessible → drop the group
    if (flat.length === 1) { out.push({ kind: "link", ...flat[0] }); continue; }
    out.push({ kind: "group", id: g.id, label: g.label, sections });
  }
  return out;
}

// ── Editor tree (for the visual builder) ─────────────────────────────────────
export type EItem = { slug: string; label: string; icon: string; hidden: boolean };
export type ESection = { title: string | null; items: EItem[] };
export type EGroup =
  | { kind: "link"; slug: string; label: string; icon: string; hidden: boolean }
  | { kind: "menu"; id: string; label: string; hidden: boolean; sections: ESection[] };

/**
 * Layout → editor tree. allowedSlugs null = show every module (household
 * scope, owner); an array gates the editor to what that member may see
 * (personal scope) — hidden items still show so they can be un-hidden.
 */
export function layoutToTree(layout: NavLayout | null, allowedSlugs: string[] | null): EGroup[] {
  const allowed = allowedSlugs ? new Set(allowedSlugs) : null;
  const ok = (slug: string) => !allowed || allowed.has(slug);
  const out: EGroup[] = [];
  for (const g of reconcileLayout(layout).groups) {
    if (g.type === "link") {
      if (!ok(g.slug)) continue;
      const m = getModule(g.slug)!;
      out.push({ kind: "link", slug: g.slug, label: m.name, icon: m.icon, hidden: !!g.hidden });
    } else {
      const sections: ESection[] = g.sections.map((s) => ({
        title: s.title,
        items: s.items.filter((i) => ok(i.slug)).map((i) => {
          const m = getModule(i.slug)!;
          return { slug: i.slug, label: m.name, icon: m.icon, hidden: !!i.hidden };
        }),
      }));
      if (sections.length === 0) sections.push({ title: null, items: [] });
      out.push({ kind: "menu", id: g.id, label: g.label, hidden: !!g.hidden, sections });
    }
  }
  return out;
}

/** Serialise an edited tree back to the saved layout shape. */
export function treeToLayout(groups: EGroup[]): NavLayout {
  return {
    v: 2,
    groups: groups.map((g) =>
      g.kind === "link"
        ? { type: "link" as const, slug: g.slug, hidden: g.hidden }
        : {
            type: "menu" as const,
            id: g.id,
            label: g.label,
            hidden: g.hidden,
            sections: g.sections.map((s) => ({
              title: s.title,
              items: s.items.map((i) => ({ slug: i.slug, hidden: i.hidden })),
            })),
          }
    ),
  };
}
