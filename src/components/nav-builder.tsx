"use client";

/**
 * NavBuilder — visual drag-and-drop menu editor (ported from Tracey's
 * nav-builder, family-sized and Tailwind-styled).
 *
 * Top: a live PREVIEW of the real bar so you can see the menu as you shape it.
 * Below: a board of cards — small cards for top-level buttons, big columns for
 * menus. Drag things between menus and sub-menus, make new menus and sub-menus,
 * rename or remove them, and switch things on or off. Nothing changes until
 * Save.
 *
 * This editor only ARRANGES the menu. Who can open what is set by permissions
 * (Settings → Members) and always applies on top — the builder can never show
 * someone a module their permissions removed.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNavPrefs, resetNavPrefs, type NavScope } from "@/lib/actions/nav";
import { treeToLayout, newMenuId, type EGroup, type EItem } from "@/lib/nav-catalog";

type EMenu = Extract<EGroup, { kind: "menu" }>;

type DropTarget =
  | { to: "top"; before: string | null } // group key to insert before (null = end)
  | { to: "menu"; menuId: string; sIdx: number; beforeSlug: string | null };

const keyOf = (g: EGroup) => (g.kind === "link" ? `link:${g.slug}` : `menu:${g.id}`);

const iconBtn =
  "rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[0.7rem] leading-tight hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-white";
const iconBtnDark =
  "rounded border border-stone-600 bg-transparent px-1.5 py-0.5 text-[0.7rem] leading-tight text-stone-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";

export function NavBuilder({ scope, initial }: { scope: NavScope; initial: EGroup[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<EGroup[]>(() => structuredClone(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<string | null>(null);
  const drag = useRef<string | null>(null); // slug being dragged
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
  const moveGroup = (i: number, dir: number) =>
    mutate((gs) => {
      const j = i + dir;
      if (j < 0 || j >= gs.length) return;
      [gs[i], gs[j]] = [gs[j], gs[i]];
    });
  const toggleGroup = (i: number) => mutate((gs) => { gs[i].hidden = !gs[i].hidden; });
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

  // Every module appears exactly once, so the drag payload is just its slug:
  // pull it out of wherever it lives, then drop it into the target.
  const relocate = (target: DropTarget) => {
    const slug = drag.current;
    drag.current = null;
    setDropHint(null);
    if (!slug) return;
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

  const dragProps = (slug: string) => ({
    draggable: true,
    onDragStart: () => { drag.current = slug; },
    onDragEnd: () => { drag.current = null; setDropHint(null); },
  });

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
    const ok = window.confirm(
      scope === "household"
        ? "Put the family menu back to the standard layout?"
        : "Put your menu back to the family default?"
    );
    if (!ok) return;
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

      {/* Board */}
      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {groups.map((g, gi) =>
          g.kind === "link" ? (
            <div
              key={keyOf(g)}
              className={`w-44 shrink-0 rounded-xl border bg-white ${
                dropHint === keyOf(g) ? "border-teal-400 ring-2 ring-teal-200" : "border-stone-200"
              } ${g.hidden ? "opacity-60" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDropHint(keyOf(g)); }}
              onDragLeave={() => setDropHint((h) => (h === keyOf(g) ? null : h))}
              onDrop={(e) => { e.preventDefault(); relocate({ to: "top", before: keyOf(g) }); }}
            >
              <div className="flex items-center gap-1 border-b border-stone-100 px-2 py-1.5">
                <button type="button" className={iconBtn} onClick={() => moveGroup(gi, -1)} disabled={gi === 0} title="Move left">◀</button>
                <button type="button" className={iconBtn} onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1} title="Move right">▶</button>
                <span className="flex-1 truncate text-[0.65rem] font-semibold uppercase tracking-wide text-stone-400">Button</span>
                <input type="checkbox" checked={!g.hidden} onChange={() => toggleGroup(gi)} title="Show on the bar" />
              </div>
              <div
                {...dragProps(g.slug)}
                className={`m-1.5 flex cursor-grab items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 active:cursor-grabbing ${
                  g.hidden ? "bg-stone-50 line-through opacity-60" : ""
                }`}
              >
                <span aria-hidden className="text-stone-300">⠿</span>
                <span>{g.icon}</span>
                <span className="truncate text-sm">{g.label}</span>
              </div>
            </div>
          ) : (
            <div
              key={keyOf(g)}
              className={`w-64 shrink-0 rounded-xl border border-stone-200 bg-white ${g.hidden ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-1 rounded-t-xl bg-stone-900 px-2 py-2 text-white">
                <button type="button" className={iconBtnDark} onClick={() => moveGroup(gi, -1)} disabled={gi === 0} title="Move left">◀</button>
                <button type="button" className={iconBtnDark} onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1} title="Move right">▶</button>
                <input
                  value={g.label}
                  onChange={(e) => renameMenu(g.id, e.target.value)}
                  title="Rename this menu"
                  className="min-w-0 flex-1 rounded border border-stone-600 bg-transparent px-1.5 py-0.5 text-sm font-semibold text-white placeholder-stone-400 focus:border-teal-400 focus:outline-none"
                  placeholder="Menu name…"
                />
                <input type="checkbox" checked={!g.hidden} onChange={() => toggleGroup(gi)} title="Show this menu" />
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
                    onDragOver={(e) => { e.preventDefault(); setDropHint(`${g.id}:${si}:END`); }}
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
                          {...dragProps(it.slug)}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropHint(`${g.id}:${si}:${it.slug}`); }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); relocate({ to: "menu", menuId: g.id, sIdx: si, beforeSlug: it.slug }); }}
                          className={`my-0.5 flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1 active:cursor-grabbing ${
                            dropHint === `${g.id}:${si}:${it.slug}` ? "border-t-2 border-t-teal-400" : ""
                          } ${it.hidden ? "border-stone-100 bg-stone-50 opacity-60" : "border-stone-200 bg-white"}`}
                        >
                          <span aria-hidden className="text-stone-300">⠿</span>
                          <input type="checkbox" checked={!it.hidden} onChange={() => toggleItem(g.id, si, it.slug)} title="Show this item" />
                          <span>{it.icon}</span>
                          <span className={`flex-1 truncate text-sm ${it.hidden ? "line-through" : ""}`}>{it.label}</span>
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
          )
        )}

        {/* Trailing: new menu + top-level drop zone */}
        <div className="w-52 shrink-0 space-y-2">
          <button
            type="button"
            onClick={addMenu}
            className="w-full rounded-xl border border-dashed border-stone-300 px-3 py-3 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            + New menu
          </button>
          <div
            className={`rounded-xl border border-dashed p-4 text-center text-xs ${
              dropHint === "TOP:END" ? "border-teal-400 bg-teal-50 text-teal-700" : "border-stone-200 text-stone-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDropHint("TOP:END"); }}
            onDragLeave={() => setDropHint((h) => (h === "TOP:END" ? null : h))}
            onDrop={(e) => { e.preventDefault(); relocate({ to: "top", before: null }); }}
          >
            Drop something here to give it its own button on the bar
          </div>
        </div>
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
