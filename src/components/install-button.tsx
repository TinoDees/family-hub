"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "samsung" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/android/i.test(ua)) return "android";
  return "other";
}

const HELP: Record<Platform, string> = {
  ios: "Open this site in Safari, tap the Share button, then 'Add to Home Screen'.",
  samsung: "Tap the ☰ menu (bottom right), choose 'Add page to', then 'Home screen'.",
  android: "Tap the ⋮ menu (top right), then 'Add to Home screen' or 'Install app'.",
  other: "Open your browser menu and choose 'Add to Home screen' / 'Install'.",
};

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true); // assume installed until we know otherwise
  const [platform, setPlatform] = useState<Platform>("other");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    // register the minimal service worker (helps installability)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (standalone) return; // inside the installed app — keep hidden

    setInstalled(false);
    setPlatform(detectPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return null;

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            if (choice.outcome === "accepted") setInstalled(true);
            return;
          }
          setHelp((v) => !v);
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
      >
        <span>📲</span> Install app
      </button>
      {help && (
        <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
          {HELP[platform]}
        </p>
      )}
    </div>
  );
}
