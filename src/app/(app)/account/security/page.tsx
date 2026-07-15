"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls, buttonCls } from "@/components/auth-card";

type Factor = { id: string; status: string; factor_type: string };

function Security() {
  const params = useSearchParams();
  const next = params.get("next");
  const [factor, setFactor] = useState<Factor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aal, setAal] = useState<string>("aal1");
  const supabase = createClient();

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = (data?.totp ?? []).find((f) => f.status === "verified") ?? null;
    setFactor(totp as Factor | null);
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(level?.currentLevel ?? "aal1");
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    // clear any half-finished enrolments first
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.totp ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Nestly",
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEnrollId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const verify = async (factorId: string) => {
    setBusy(true);
    setError(null);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) {
      setBusy(false);
      return setError(cErr.message);
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) return setError("That code didn't match — check your authenticator app and try again.");
    setCode("");
    setQr(null);
    setEnrollId(null);
    if (next) window.location.assign(next);
    else refresh();
  };

  const disable = async () => {
    if (!factor) return;
    if (!window.confirm("Turn off two-factor authentication?")) return;
    setBusy(true);
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    refresh();
  };

  if (!loaded) return <p className="text-sm text-stone-400">Loading…</p>;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">🔐 Security</h1>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {factor && aal === "aal1" ? (
        /* factor exists, session not yet elevated — challenge */
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold">Enter your 6-digit code</h2>
          <p className="mt-1 text-sm text-stone-500">
            Open your authenticator app and enter the code for Nestly.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="123456"
              className={`${inputCls} text-center text-lg tracking-widest`}
            />
            <button
              onClick={() => verify(factor.id)}
              disabled={busy || code.trim().length !== 6}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Checking…" : "Verify"}
            </button>
          </div>
        </div>
      ) : factor ? (
        /* enabled + verified this session */
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-900">✅ Two-factor authentication is on</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Signing into sensitive areas asks for a code from your authenticator app.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {next && (
              <a href={next} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
                Continue →
              </a>
            )}
            <button
              onClick={disable}
              disabled={busy}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
            >
              Turn off 2FA
            </button>
          </div>
        </div>
      ) : qr && enrollId ? (
        /* enrolment in progress */
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold">Scan this with your authenticator app</h2>
          <p className="mt-1 text-sm text-stone-500">
            Google Authenticator, Microsoft Authenticator, 1Password — any TOTP app works.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="2FA QR code" className="mx-auto mt-4 h-44 w-44" />
          {secret && (
            <p className="mt-2 break-all text-center text-xs text-stone-400">
              Or enter manually: <span className="font-mono">{secret}</span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter the 6-digit code"
              className={`${inputCls} text-center text-lg tracking-widest`}
            />
            <button
              onClick={() => verify(enrollId)}
              disabled={busy || code.trim().length !== 6}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Checking…" : "Activate"}
            </button>
          </div>
        </div>
      ) : (
        /* not enrolled */
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-stone-500">
            Add a second lock on your account: after your password, you enter a 6-digit code
            from an authenticator app on your phone.
            {next?.startsWith("/admin") && " Required for the platform admin area."}
          </p>
          <button onClick={startEnroll} disabled={busy} className={`${buttonCls} mt-4`}>
            {busy ? "Preparing…" : "Set up 2FA"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense>
      <Security />
    </Suspense>
  );
}
