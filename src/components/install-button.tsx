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

type Platform =
  | "ios"
  | "samsung"
  | "edge-android"
  | "firefox-android"
  | "chrome-android"
  | "android-other"
  | "edge-desktop"
  | "chrome-desktop"
  | "desktop-other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/EdgA/i.test(ua)) return "edge-android";
    if (/Firefox/i.test(ua)) return "firefox-android";
    if (/Chrome/i.test(ua)) return "chrome-android";
    return "android-other";
  }
  if (/Edg\//i.test(ua)) return "edge-desktop";
  if (/Chrome/i.test(ua)) return "chrome-desktop";
  return "desktop-other";
}

const GUIDES: Record<Platform, { steps: string[]; note?: string }> = {
  ios: {
    steps: [
      "Tap the Share button (square with ↑) at the bottom of Safari",
      "Scroll down, tap “Add to Home Screen”, then “Add”",
      "Open Nestly from your Home Screen (needed for notifications)",
    ],
    note: "Apple only allows installs through Safari's Share menu.",
  },
  samsung: {
    steps: ["Tap the ☰ menu (bottom right)", "Tap “Add page to” → “Home screen”"],
    note: "On a phone, opening nestlyapp.co in Chrome gives a one-tap install. On a shared screen (fridge, TV, kitchen tablet) these two steps are the install — the app works exactly the same afterwards.",
  },
  "edge-android": {
    steps: ["Tap the ⋯ menu (bottom middle)", "Tap “Add to phone”, then confirm"],
    note: "Tip: open nestlyapp.co in Chrome instead for a true one-tap install.",
  },
  "firefox-android": {
    steps: ["Tap the ⋮ menu", "Tap “Install” (or “Add to Home screen”)"],
  },
  "chrome-android": {
    steps: ["Tap the ⋮ menu (top right)", "Tap “Install app” (or “Add to Home screen”)"],
    note: "If the menu says “Open app”, Nestly is already installed on this phone.",
  },
  "android-other": {
    steps: ["Open your browser menu", "Choose “Install app” / “Add to Home screen”"],
    note: "On shared screens (fridge, TV, kitchen tablet) the browser may not offer one-tap install — Add to Home screen is the install, and the app works exactly the same.",
  },
  "edge-desktop": {
    steps: [
      "Click the ⋯ menu (top right) → Apps → “Install Nestly”",
      "Tick “Pin to taskbar” in the dialog, then Install",
    ],
  },
  "chrome-desktop": {
    steps: [
      "Click the install icon at the right end of the address bar (screen with ↓), or ⋮ → “Install Nestly”",
      "After installing: right-click the Nestly icon in the taskbar → “Pin to taskbar”",
    ],
  },
  "desktop-other": {
    steps: ["Open your browser menu and choose “Install” / “Add to Home screen”"],
    note: "Chrome and Edge give the smoothest install on PC.",
  },
};

export function InstallButton() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [platform, setPlatform] = useState<Platform>("desktop-other");
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update().catch(() => undefined))
        .catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (standalone) return; // inside the installed app

    setHidden(false);
    setPlatform(detectPlatform());
    setReady(Boolean(window.__nestlyInstall));

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
      window.__nestlyInstall = null;
      setReady(false);
      if (choice.outcome === "accepted") setHidden(true);
    } finally {
      setBusy(false);
    }
  };

  const guide = GUIDES[platform];

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={oneTap}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
      >
        <span>📲</span>{" "}
        {busy ? "Installing…" : ready ? "Install app" : "How to install on this device"}
        {ready && (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            1 tap
          </span>
        )}
      </button>
      {help && !ready && (
        <div className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
          <ol className="list-decimal space-y-1 pl-4">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.note && <p className="mt-1.5 text-sky-600">{guide.note}</p>}
        </div>
      )}
    </div>
  );
}
