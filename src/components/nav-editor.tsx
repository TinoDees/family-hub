/**
 * @deprecated The simple up/down NavEditor was replaced by the visual
 * drag-and-drop NavBuilder (src/components/nav-builder.tsx) on 16 Jul 2026 —
 * menus, sub-menus, drag between them, live preview. This re-export keeps any
 * stale import compiling; new code should import NavBuilder directly.
 */
export { NavBuilder as NavEditor, NavBuilderTabs } from "@/components/nav-builder";
