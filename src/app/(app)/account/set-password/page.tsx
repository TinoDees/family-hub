"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls, buttonCls } from "@/components/auth-card";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: { force_password_change: false },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.assign("/dashboard");
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mt-1 text-sm text-stone-500">
          Choose a new password to secure your account. You only need to do this once.
        </p>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            placeholder="New password (min 8 characters)"
            className={inputCls}
          />
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            placeholder="Confirm password"
            className={inputCls}
          />
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="rounded border-stone-300"
            />
            Show passwords
          </label>
          <button disabled={busy} className={buttonCls}>
            {busy ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
