/**
 * Client-safe device platform detection for the "Set up your phone" flow.
 * Coarser than install-button.tsx's browser-level detection on purpose:
 * the setup flow only cares which of three paths to show.
 */

export type DevicePlatform = "ios" | "android" | "desktop";

export function detectDevicePlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ pretends to be a Mac — but Macs don't have multi-touch screens
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/** True when running inside the installed (Home Screen / PWA) app. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as { standalone?: boolean }).standalone))
  );
}
