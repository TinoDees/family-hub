"use client";

import { useEffect, useRef, useState } from "react";

type WakeLockSentinel = { release: () => Promise<void>; addEventListener: (t: string, cb: () => void) => void };

export function CookMode() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setSupported("wakeLock" in navigator);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = (await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen"));
        if (cancelled) {
          lock.release();
          return;
        }
        lockRef.current = lock;
        // if the browser drops it (tab switch etc.), re-acquire when we're back
        lock.addEventListener("release", () => {
          lockRef.current = null;
        });
      } catch {
        setOn(false);
      }
    };

    const onVisible = () => {
      if (on && document.visibilityState === "visible" && !lockRef.current) acquire();
    };

    if (on) {
      acquire();
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [on]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        on
          ? "border-amber-400 bg-amber-50 text-amber-700"
          : "border-stone-300 text-stone-600 hover:bg-stone-100"
      }`}
      title="Keeps the screen on while you cook"
    >
      {on ? "🔆 Screen staying on" : "🍳 Cook mode"}
    </button>
  );
}
