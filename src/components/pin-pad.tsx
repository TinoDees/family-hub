"use client";

/**
 * Shared on-screen PIN pad (4 OR 6 digits) — used by the idle lock and the
 * module PIN shield. Big buttons so no native keyboard pops up on tablets;
 * physical keyboards work via a key listener. Auto-submits at 6 digits;
 * an Unlock button appears from 4.
 */
import { useCallback, useEffect, useState } from "react";

export default function PinPad({
  onSubmit,
  busy,
  error,
  hint = "Enter your 4 or 6 digit PIN.",
}: {
  onSubmit: (pin: string) => void;
  busy: boolean;
  error: string | null;
  hint?: string;
}) {
  const [pin, setPin] = useState("");

  // parent signals a failed attempt via `error` — clear the dots
  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  const pressDigit = useCallback(
    (d: string) => {
      if (busy) return;
      setPin((prev) => {
        if (prev.length >= 6) return prev;
        const next = prev + d;
        if (next.length === 6) onSubmit(next); // auto-submit on the 6th digit
        return next;
      });
    },
    [busy, onSubmit]
  );

  // physical keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      } else if (e.key === "Escape") {
        setPin("");
      } else if (e.key === "Enter" && pin.length >= 4) {
        e.preventDefault();
        onSubmit(pin);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pressDigit, onSubmit, pin]);

  const padBtn =
    "rounded-xl border border-stone-200 bg-stone-100 py-3 text-2xl font-bold text-stone-900 select-none touch-manipulation hover:bg-stone-200 disabled:opacity-50";

  return (
    <div>
      {/* PIN dots */}
      <div className="mb-1 flex justify-center gap-2.5" aria-label="PIN entry">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border transition-colors ${
              i < pin.length
                ? "border-stone-900 bg-stone-900"
                : "border-stone-300 bg-stone-200"
            } ${i >= 4 && pin.length <= 4 ? "opacity-40" : ""}`}
          />
        ))}
      </div>
      <div
        className={`my-2 min-h-5 text-xs ${error ? "font-semibold text-red-600" : "text-stone-500"}`}
      >
        {busy ? "Checking…" : (error ?? hint)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={padBtn} disabled={busy} onClick={() => pressDigit(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className={`${padBtn} text-sm font-semibold text-stone-500`}
          disabled={busy}
          onClick={() => setPin("")}
          aria-label="Clear"
        >
          clear
        </button>
        <button type="button" className={padBtn} disabled={busy} onClick={() => pressDigit("0")}>
          0
        </button>
        <button
          type="button"
          className={`${padBtn} text-xl text-stone-500`}
          disabled={busy}
          onClick={() => setPin((p) => p.slice(0, -1))}
          aria-label="Backspace"
        >
          ⌫
        </button>
      </div>
      {pin.length >= 4 && pin.length < 6 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit(pin)}
          className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Unlock with {pin.length}-digit PIN
        </button>
      )}
    </div>
  );
}
