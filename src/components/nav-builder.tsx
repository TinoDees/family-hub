"use client";

/**
 * NavBuilder — visual drag-and-drop menu editor (ported from Tracey's
 * nav-builder, family-sized and Tailwind-styled).
 *
 * Top: a live PREVIEW of the real bar so you can see the menu as you shape it.
 * Below: a board of columns that WRAPS (never scrolls sideways). The first
 * column is the MENU BAR — one chip per top-level thing (direct links and
 * menus), in bar order. Drag chips up/down to reorder the bar, drag a link
 * chip into a menu column to tuck it away, drag items out of menus back onto
 * the bar. Menus are chips too, so their spot on the bar is dragged the same
 * way. Each menu is its own column: rename it, hide it, delete it, make
 * sub-menus, switch items on or off. Nothing changes until Save.
 *
 * This editor only ARRANGES the menu. Who can open what is set by permissions
 * (Settings → Members) and always applies on top — the builder can never show
 * someone a module their permissions removed.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNavPrefs, resetNavPrefs, type NavScope } from "@/lib/actions/nav";
import { treeToLayout, newMenuId, type EGroup, type EItem } from "@/lib/nav-catalog";
import { getModule } from "@/lib/modules";

type EMenu = Extract<EGroup, { kind: "menu" }>;

/**
 * Tiny shield chip so the builder shows WHO will see an item and whether a
 * PIN guards it — the badge is informational; permissions do the real gating.
 */
function LockBadge({ slug }: { slug: string }) {
  const m = getModule(slug);
  if (!m) return null;
  const ownerOnly = m.defaults.adult === "none" && m.defaults.child === "none";
  const adultsOnly = !ownerOnly && m.defaults.child === "none";
  if (!m.pinShield && !ownerOnly && !adultsOnly) return null;
  const label = ownerOnly ? "owner" : adultsOnly ? "adults" : "";
  return (
    <span
      title={`${label ? `Visible to ${label} by default (overridable per member). ` : ""}${m.pinShield ? "Opens with PIN on shared devices." : ""}`}
      className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-stone-50 px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-wide text-stone-500"
    >
      🔒{label && <span>{label}</span>}
    </span>
  );
}

/** What is being dragged: a module chip (lives anywhere) or a whole group's bar position. */
type Drag = { kind: "item"; slug: string } | { kind: "group"; key: string };

type DropTarget =
  | { to: "top"; before: string | null } // group key to insert before (null = end)
  | { to: "menu"; menuId: string; sIdx: number; beforeSlug: string | null };

const keyOf = (g: EGroup) => (g.kind === "link" ? `link:${g.slug}` : `menu:${g.id}`);

const iconBtn =
  "rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[0.7rem] leading-tight hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-white";
const iconBtnDark =
  "rounded border border-stone-600 bg-transparent px-1.5 py-0.5 text-[0.7rem] leading-tight text-stone-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";
const cardHeader = "flex items-center gap-1.5 rounded-t-xl bg-stone-900 px-2.5 py-2 text-white";

const RESET_CONFIRM: Record<NavScope, string> = {
  global: "Put the default menu for every household back to the built-in layout?",
  household: "Put the family menu back to the standard layout?",
  mine: "Put your menu back to the family default?",
};

export function NavBuilder({ scope, initial }: { scope: NavScope; initial: EGroup[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<EGroup[]>(() => structuredClone(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);

  const mutate = (fn: (gs: EGroup[]) => void) => {
    setGroups((gs) => {
      const n = structuredClone(gs);
      fn(n);
      return n;
    });
    setDirty(true);
    setMsg(null);
    setErr(null);
  };

  // ── group / section / item ops ─────────────────────────────────────────────
  const toggleGroup = (key: string) =>
    mutate((gs) => {
      const g = gs.find((x) => keyOf(x) === key);
      if (g) g.hidden = !g.hidden;
    });
  const renameMenu = (id: string, label: string) =>
    mutate((gs) => {
      const g = gs.find((x) => x.kind === "menu" && x.id === id) as EMenu | undefined;
      if (g) g.label = label;
    });
  const addMenu = () =>
    mutate((gs) => {
      gs.push({ kind: "menu", id: newMenuId(), label: "New menu", hidden: false, sections: [{ title: null, items: [] }] });
    });
  const deleteMenu = (id: string) =>
    mutate((gs) => {
      const i = gs.findIndex((x) => x.kind === "menu" && x.id === id);
      if (i < 0) return;
      const m = gs[i] as EMenu;
      const links: EGroup[] = m.sections.flatMap((s) =>
        s.items.map((it) => ({ kind: "link" as const, slug: it.slug, label: it.label, icon: it.icon, hidden: it.hidden }))
      );
      gs.splice(i, 1, ...links); // its things go back to the bar, in place
    });
  const findMenu = (gs: EGroup[], id: string) => gs.find((x) => x.kind === "menu" && x.id === id) as EMenu | undefined;
  const addSection = (id: string) =>
    mutate((gs) => { findMenu(gs, id)?.sections.push({ title: "New sub-menu", items: [] }); });
  const renameSection = (id: string, si: number, title: string) =>
    mutate((gs) => {
      const m = findMenu(gs, id);
      if (m) m.sections[si].title = title.trim() === "" ? null : title;
    });
  const moveSection = (id: string, si: number, dir: number) =>
    mutate((gs) => {
      const m = findMenu(gs, id);
      if (!m) return;
      const j = si + dir;
      if (j < 0 || j >= m.sections.length) return;
      [m.sections[si], m.sections[j]] = [m.sections[j], m.sections[si]];
    });
  const deleteSection = (id: string, si: number) =>
    mutate((gs) => {
      const m = findMenu(gs, id);
      if (!m || m.sections.length <= 1) return;
      const dest = si === 0 ? 1 : 0;
      m.sections[dest].items.push(...m.sections[si].items);
      m.sections.splice(si, 1);
    });
  const toggleItem = (id: string, si: number, slug: string) =>
    mutate((gs) => {
      const it = findMenu(gs, id)?.sections[si].items.find((i) => i.slug === slug);
      if (it) it.hidden = !it.hidden;
    });

  // ── drag & drop ────────────────────────────────────────────────────────────
  // Two payloads: an ITEM (a module — appears exactly once, so the slug is
  // enough: pull it out of wherever it lives, drop it into the target) or a
  // GROUP (a whole menu's chip on the bar — only reorders the top level).
  const relocate = (target: DropTarget) => {
    const d = drag.current;
    drag.current = null;
    setDropHint(null);
    if (!d) return;

    if (d.kind === "group") {
      if (target.to !== "top" || target.before === d.key) return; // menus can't go inside menus
      mutate((gs) => {
        const from = gs.findIndex((g) => keyOf(g) === d.key);
        if (from < 0) return;
        const [moving] = gs.splice(from, 1);
        const bi = target.before ? gs.findIndex((g) => keyOf(g) === target.before) : -1;
        if (bi >= 0) gs.splice(bi, 0, moving);
        else gs.push(moving);
      });
      return;
    }

    const slug = d.slug;
    mutate((gs) => {
      let item: EItem | null = null;
      for (let i = 0; i < gs.length && !item; i++) {
        const g = gs[i];
        if (g.kind === "link" && g.slug === slug) {
          item = { slug: g.slug, label: g.label, icon: g.icon, hidden: g.hidden };
          gs.splice(i, 1);
        } else if (g.kind === "menu") {
          for (const s of g.sections) {
            const idx = s.items.findIndex((it) => it.slug === slug);
            if (idx >= 0) { item = s.items.splice(idx, 1)[0]; break; }
          }
        }
      }
      if (!item) return;
      if (target.to === "top") {
        const link: EGroup = { kind: "link", slug: item.slug, label: item.label, icon: item.icon, hidden: item.hidden };
        const bi = target.before ? gs.findIndex((g) => keyOf(g) === target.before) : -1;
        if (bi >= 0) gs.splice(bi, 0, link);
        else gs.push(link);
        return;
      }
      const m = findMenu(gs, target.menuId);
      const sec = m ? m.sections[target.sIdx] ?? m.sections[m.sections.length - 1] : undefined;
      if (!sec) { gs.push({ kind: "link", slug: item.slug, label: item.label, icon: item.icon, hidden: item.hidden }); return; }
      const bi = target.beforeSlug ? sec.items.findIndex((i) => i.slug === target.beforeSlug) : -1;
      if (bi >= 0) sec.items.splice(bi, 0, item);
      else sec.items.push(item);
    });
  };

  const startDrag = (d: Drag) => ({
    draggable: true,
    onDragStart: () => { drag.current = d; },
    onDragEnd: () => { drag.current = null; setDropHint(null); },
  });
  /** Bar chips accept both payloads; menu sections only accept items. */
  const topDropProps = (before: string | null) => {
    const hint = `TOP:${before ?? "END"}`;
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDropHint(hint); },
      onDragLeave: () => setDropHint((h) => (h === hint ? null : h)),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); relocate({ to: "top", before }); },
    };
  };

  // ── save / reset ───────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const res = await saveNavPrefs(scope, treeToLayout(groups));
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? "Could not save"); return; }
    setDirty(false);
    setMsg("Saved — the menu is live.");
    router.refresh();
  };
  const reset = async () => {
    if (!window.confirm(RESET_CONFIRM[scope])) return;
    setSaving(true);
    const res = await resetNavPrefs(scope);
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? "Could not reset"); return; }
    setDirty(false);
    setMsg("Back to the default.");
    router.refresh();
  };

  // ── preview (layout-only: show/hide; permissions apply on top in the real bar)
  type PNode =
    | { kind: "link"; slug: string; label: string; icon: string }
    | { kind: "group"; id: string; label: string; sections: { title: string | null; items: EItem[] }[] };
  const preview: PNode[] = [];
  for (const g of groups) {
    if (g.hidden) continue;
    if (g.kind === "link") { preview.push({ kind: "link", slug: g.slug, label: g.label, icon: g.icon }); continue; }
    const sections = g.sections
      .map((s) => ({ title: s.title, items: s.items.filter((i) => !i.hidden) }))
      .filter((s) => s.items.length > 0);
    const flat = sections.flatMap((s) => s.items);
    if (flat.length === 0) continue;
    if (flat.length === 1) { preview.push({ kind: "link", slug: flat[0].slug, label: flat[0].label, icon: flat[0].icon }); continue; }
    preview.push({ kind: "group", id: g.id, label: g.label, sections });
  }
  const openedPreview = preview.find((p) => p.kind === "group" && p.id === openPreview) as
    | Extract<PNode, { kind: "group" }>
    | undefined;

  const menus = groups.filter((g): g is EMenu => g.kind === "menu");

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save layout"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-40"
        >
          Reset to default
        </button>
        {dirty && <span className="text-xs font-medium text-amber-600">● Not saved yet — nothing changes until you Save</span>}
        {msg && <span className="text-xs font-medium text-emerald-700">{msg}</span>}
        {err && <span className="text-xs font-medium text-red-600">{err}</span>}
      </div>

      {/* Live preview bar */}
      <div className="mb-4">
        <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-stone-400">Preview</div>
        <div className="flex min-h-12 flex-wrap items-center gap-1 rounded-xl bg-stone-900 px-2 py-1.5">
          <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white">
            <span>🏡</span> Home
          </span>
          {preview.map((p) =>
            p.kind === "link" ? (
              <span key={p.slug} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-300">
                <span>{p.icon}</span> {p.label}
              </span>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenPreview((o) => (o === p.id ? null : p.id))}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                  openPreview === p.id ? "bg-white/15 text-white" : "text-stone-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {p.label} <span className="text-[0.6rem] opacity-70">▾</span>
              </button>
            )
          )}
        </div>
        {openedPreview && (
          <div className="flex flex-wrap gap-6 rounded-b-xl border border-t-0 border-stone-200 bg-white px-4 py-3">
            {openedPreview.sections.map((s, si) => (
              <div key={si}>
                {s.title && (
                  <div className="pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-stone-400">{s.title}</div>
                )}
                {s.items.map((it) => (
                  <div key={it.slug} className="flex items-center gap-2 py-0.5 text-sm text-stone-800">
                    <span>{it.icon}</span> {it.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Board — wraps, never scrolls sideways */}
      <div className="flex flex-wrap items-start gap-3 pb-2">
        {/* The MENU BAR column: every top-level thing as a chip, in bar order */}
        <div className="w-64 rounded-xl border border-stone-200 bg-white">
          <div className={cardHeader}>
            <span className="flex-1 truncate text-sm font-semibold">Menu bar</span>
            <span className="text-[0.62rem] uppercase tracking-wide text-stone-400">top level</span>
          </div>
          <div className="px-2 pb-2 pt-1.5">
            {groups.map((g) => {
              const key = keyOf(g);
              const hintCls = dropHint === `TOP:${key}` ? "border-t-2 border-t-teal-400" : "";
              return g.kind === "link" ? (
                <div
                  key={key}
                  {...startDrag({ kind: "item", slug: g.slug })}
                  {...topDropProps(key)}
                  className={`my-0.5 flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1 active:cursor-grabbing ${hintCls} ${
                    g.hidden ? "border-stone-100 bg-stone-50 opacity-60" : "border-stone-200 bg-white"
                  }`}
                >
                  <span aria-hidden className="text-stone-300">⠿</span>
                  <input type="checkbox" checked={!g.hidden} onChange={() => toggleGroup(key)} title="Show on the bar" />
                  <span>{g.icon}</span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${g.hidden ? "line-through" : ""}`}>{g.label}</span>
                  <LockBadge slug={g.slug} />
                </div>
              ) : (
                <div
                  key={key}
                  {...startDrag({ kind: "group", key })}
                  {...topDropProps(key)}
                  className={`my-0.5 flex cursor-grab items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-white active:cursor-grabbing ${hintCls} ${
                    g.hidden ? "opacity-50" : ""
                  }`}
                  title="A menu — drag to change where it sits on the bar"
                >
                  <span aria-hidden className="text-stone-500">⠿</span>
                  <span className={`flex-1 truncate text-sm font-medium ${g.hidden ? "line-through" : ""}`}>
                    {g.label} <span className="text-[0.6rem] opacity-70">▾</span>
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-wide text-stone-400">menu</span>
                </div>
              );
            })}
            <div
              {...topDropProps(null)}
              className={`mt-1.5 rounded-lg border border-dashed p-2.5 text-center text-xs ${
                dropHint === "TOP:END" ? "border-teal-400 bg-teal-50 text-teal-700" : "border-stone-200 text-stone-400"
              }`}
            >
              drop here for its own spot on the bar
            </div>
          </div>
        </div>

        {/* One column per menu */}
        {menus.map((g) => (
          <div
            key={keyOf(g)}
            className={`w-64 rounded-xl border border-stone-200 bg-white ${g.hidden ? "opacity-60" : ""}`}
          >
            <div className={cardHeader}>
              <input
                value={g.label}
                onChange={(e) => renameMenu(g.id, e.target.value)}
                title="Rename this menu"
                className="min-w-0 flex-1 rounded border border-stone-600 bg-transparent px-1.5 py-0.5 text-sm font-semibold text-white placeholder-stone-400 focus:border-teal-400 focus:outline-none"
                placeholder="Menu name…"
              />
              <input type="checkbox" checked={!g.hidden} onChange={() => toggleGroup(keyOf(g))} title="Show this menu" />
              <button
                type="button"
                className={`${iconBtnDark} text-red-300 hover:text-red-200`}
                onClick={() => deleteMenu(g.id)}
                title="Remove this menu (its things go back to the bar)"
              >
                ✕
              </button>
            </div>
            <div className="px-2 pb-2 pt-1.5">
              {g.sections.map((s, si) => (
                <div
                  key={si}
                  className="mb-2"
                  onDragOver={(e) => {
                    if (drag.current?.kind === "group") return; // menus can't nest
                    e.preventDefault();
                    setDropHint(`${g.id}:${si}:END`);
                  }}
                  onDrop={(e) => { e.preventDefault(); relocate({ to: "menu", menuId: g.id, sIdx: si, beforeSlug: null }); }}
                >
                  <div className="mb-1 flex items-center gap-1">
                    <span aria-hidden title="Rename sub-menu" className="text-[0.7rem] text-stone-400">✎</span>
                    <input
                      value={s.title ?? ""}
                      placeholder="name this sub-menu…"
                      title="Rename this sub-menu"
                      onChange={(e) => renameSection(g.id, si, e.target.value)}
                      className="min-w-0 flex-1 rounded border border-stone-200 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-500 placeholder-stone-300 focus:border-teal-400 focus:outline-none"
                    />
                    <button type="button" className={iconBtn} onClick={() => moveSection(g.id, si, -1)} disabled={si === 0} title="Sub-menu up">▲</button>
                    <button type="button" className={iconBtn} onClick={() => moveSection(g.id, si, 1)} disabled={si === g.sections.length - 1} title="Sub-menu down">▼</button>
                    <button
                      type="button"
                      className={`${iconBtn} text-red-600`}
                      onClick={() => deleteSection(g.id, si)}
                      disabled={g.sections.length <= 1}
                      title="Remove sub-menu (its things move to the first one)"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className={`min-h-2 rounded-lg pb-0.5 ${
                      dropHint === `${g.id}:${si}:END` ? "outline-dashed outline-2 outline-teal-300" : ""
                    }`}
                  >
                    {s.items.length === 0 && (
                      <div className="rounded-lg border border-dashed border-stone-200 p-2 text-center text-xs text-stone-300">
                        drop here
                      </div>
                    )}
                    {s.items.map((it) => (
                      <div
                        key={it.slug}
                        {...startDrag({ kind: "item", slug: it.slug })}
                        onDragOver={(e) => {
                          if (drag.current?.kind === "group") return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDropHint(`${g.id}:${si}:${it.slug}`);
                        }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); relocate({ to: "menu", menuId: g.id, sIdx: si, beforeSlug: it.slug }); }}
                        className={`my-0.5 flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1 active:cursor-grabbing ${
                          dropHint === `${g.id}:${si}:${it.slug}` ? "border-t-2 border-t-teal-400" : ""
                        } ${it.hidden ? "border-stone-100 bg-stone-50 opacity-60" : "border-stone-200 bg-white"}`}
                      >
                        <span aria-hidden className="text-stone-300">⠿</span>
                        <input type="checkbox" checked={!it.hidden} onChange={() => toggleItem(g.id, si, it.slug)} title="Show this item" />
                        <span>{it.icon}</span>
                        <span className={`min-w-0 flex-1 truncate text-sm ${it.hidden ? "line-through" : ""}`}>{it.label}</span>
                        <LockBadge slug={it.slug} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addSection(g.id)}
                className="w-full rounded-lg border border-dashed border-stone-300 px-2 py-1.5 text-xs text-teal-700 hover:bg-teal-50"
              >
                + Sub-menu
              </button>
            </div>
          </div>
        ))}

        {/* Trailing: new menu */}
        <button
          type="button"
          onClick={addMenu}
          className="w-52 rounded-xl border border-dashed border-stone-300 px-3 py-3 text-sm font-medium text-teal-700 hover:bg-teal-50"
        >
          + New menu
        </button>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save layout"}
        </button>
      </div>
    </div>
  );
}

/** Scope switch: everyone edits their own menu; the owner also gets the family default. */
export function NavBuilderTabs({
  mine,
  household,
  householdName,
}: {
  mine: EGroup[];
  household: EGroup[] | null;
  householdName: string;
}) {
  const [tab, setTab] = useState<"mine" | "household">("mine");
  if (!household) {
    return (
      <div>
        <p className="mb-3 text-sm text-stone-500">Only you see this arrangement — it sits on top of the family menu.</p>
        <NavBuilder scope="mine" initial={mine} />
      </div>
    );
  }
  const tabCls = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${
      active ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
    }`;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className={tabCls(tab === "mine")} onClick={() => setTab("mine")}>
          My menu
        </button>
        <button type="button" className={tabCls(tab === "household")} onClick={() => setTab("household")}>
          {householdName}&apos;s menu
        </button>
      </div>
      <p className="mb-3 text-sm text-stone-500">
        {tab === "mine"
          ? "Only you see this arrangement — it sits on top of the family menu."
          : "The menu everyone in the family starts with (until they arrange their own)."}
      </p>
      {tab === "mine" ? (
        <NavBuilder key="mine" scope="mine" initial={mine} />
      ) : (
        <NavBuilder key="household" scope="household" initial={household} />
      )}
    </div>
  );
}
