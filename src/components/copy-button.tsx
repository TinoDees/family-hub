"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  path,
}: {
  text?: string;
  label?: string;
  /** when set, copies window.location.origin + path */
  path?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const value = path ? `${window.location.origin}${path}` : (text ?? "");
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
