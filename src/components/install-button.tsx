"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (standalone) return; // already installed

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIos(true);
      setShow(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          if (ios) {
            setIosHelp((v) => !v);
            return;
          }
          if (deferred) {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            if (choice.outcome === "accepted") setShow(false);
          }
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
      >
        <span>📲</span> Install app
      </button>
      {iosHelp && (
        <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
          On iPhone: open this site in <strong>Safari</strong>, tap the{" "}
          <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
