"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __nestlyInstall?: BeforeInstallPromptEvent | null;
  }
}

type Platform = "ios" | "samsung" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/android/i.test(ua)) return "android";
  return "other";
}

const IOS_STEPS = [
  "Tap the Share button (square with ↑) at the bottom of Safari",
  "Scroll down and tap “Add to Home Screen”",
  "Tap “Add” — then open Nestly from your Home Screen",
];

const HELP: Record<Exclude<Platform, "ios">, string> = {
  samsung:
    "Tap the ☰ menu (bottom right) → “Add page to” → “Home screen”. Or open this page in Chrome for one-tap install.",
  android: "Tap the ⋮ menu (top right) → “Install app” (or “Add to Home screen”).",
  other: "Open your browser menu and choose “Install app” / “Add to Home screen”.",
};

export function InstallButton() {
  const [ready, setReady] = useState(false); // one-tap prompt available
  const [hidden, setHidden] = useState(true); // inside installed app, or just installed
  const [platform, setPlatform] = useState<Platform>("other");
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Register the service worker; never serve a stale sw.js from HTTP cache and
    // check for a new one on every load, so old installs pick up push support fast.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update().catch(() => undefined))
        .catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (standalone) return; // already inside the installed app

    setHidden(false);
    setPlatform(detectPlatform());
    setReady(Boolean(window.__nestlyInstall)); // event may have fired before we mounted

    const onReady = () => setReady(true);
    const onDone = () => setHidden(true);
    window.addEventListener("nestly-install-ready", onReady);
    window.addEventListener("nestly-install-done", onDone);
    return () => {
      window.removeEventListener("nestly-install-ready", onReady);
      window.removeEventListener("nestly-install-done", onDone);
    };
  }, []);

  if (hidden) return null;

  const oneTap = async () => {
    const evt = window.__nestlyInstall;
    if (!evt) {
      setHelp((v) => !v);
      return;
    }
    setBusy(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      window.__nestlyInstall = null; // a prompt event is single-use
      setReady(false);
      if (choice.outcome === "accepted") setHidden(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={oneTap}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
      >
        <span>📲</span> {busy ? "Installing…" : "Install app"}
        {ready && <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">1 tap</span>}
      </button>
      {help && !ready && (
        <div className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
          {platform === "ios" ? (
            <ol className="list-decimal space-y-1 pl-4">
              {IOS_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : (
            HELP[platform]
          )}
        </div>
      )}
    </div>
  );
}
