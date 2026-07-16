"use client";

/**
 * "My PIN" card for Account → Security. Sets/changes/removes the user's
 * 4 or 6 digit device PIN (set_user_pin / clear_user_pin RPCs — stored as a
 * bcrypt hash, verified server-side only). The PIN resumes a locked screen
 * and opens PIN-shielded modules (Finance, Manage People, Parental Controls).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls, buttonCls } from "@/components/auth-card";

export default function PinSettings() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc("has_user_pin");
    setHasPin(Boolean(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!/^([0-9]{4}|[0-9]{6})$/.test(pin))
      return setError("PIN must be exactly 4 or 6 digits.");
    if (pin !== confirm) return setError("PINs don't match.");
    setBusy(true);
    const { error } = await supabase.rpc("set_user_pin", { p_pin: pin });
    setBusy(false);
    if (error) return setError(error.message);
    setPin("");
    setConfirm("");
    setEditing(false);
    setSaved(true);
    void refresh();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("clear_user_pin");
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(false);
    void refresh();
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6">
      <div className="text-sm font-medium">My PIN</div>
      <p className="mt-1 text-sm text-stone-500">
        A 4 or 6 digit PIN unlocks the screen after the household idle lock and opens
        protected areas (Finance, Manage People, Parental Controls) on shared devices.
        It never replaces your password for signing in.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          PIN saved.
        </p>
      )}

      {hasPin === null ? (
        <p className="mt-3 text-sm text-stone-400">Loading…</p>
      ) : editing ? (
        <div className="mt-4 space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="New PIN (4 or 6 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className={`${inputCls} w-56 text-center font-mono tracking-[0.4em]`}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="Repeat PIN"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            className={`${inputCls} w-56 text-center font-mono tracking-[0.4em]`}
          />
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy} className={`${buttonCls} w-auto px-5`}>
              {busy ? "Saving…" : "Save PIN"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPin("");
                setConfirm("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              hasPin
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {hasPin ? "PIN set" : "No PIN yet"}
          </span>
          <button onClick={() => setEditing(true)} className={`${buttonCls} w-auto px-5`}>
            {hasPin ? "Change PIN" : "Set PIN"}
          </button>
          {hasPin && (
            <button
              onClick={() => void remove()}
              disabled={busy}
              className="text-sm font-medium text-red-600 underline-offset-2 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
