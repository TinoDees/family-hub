"use client";

import { useEffect, useState } from "react";

/**
 * Reload button — only shown when Nestly runs as an installed app
 * (standalone mode has no browser chrome, so no refresh control).
 */
export function RefreshButton() {
  const [standalone, setStandalone] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean("standalone" in navigator && (navigator as { standalone?: boolean }).standalone)
    );
  }, []);

  if (!standalone) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setSpinning(true);
        window.location.reload();
      }}
      title="Refresh"
      aria-label="Refresh"
      className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm hover:bg-stone-100"
    >
      <span className={`inline-block ${spinning ? "animate-spin" : ""}`}>⟳</span>
    </button>
  );
}
