"use client";

/**
 * Household device lock-out — ported from Tracey's floor lock (mig 332 there,
 * mig 045 here), family-sized.
 *  - Idle: after `idleMinutes` of no activity the screen LOCKS (overlay). The
 *    same user taps their 4/6-digit PIN to resume — no full re-login. 5 wrong
 *    PINs, or "Switch user", does a full sign-out.
 *  - REFRESH-PROOF: lock state + last-activity persist in localStorage, so a
 *    reload (or reopening the tab after sitting idle) lands back ON the lock
 *    screen. The PIN overlay is a shoulder-surfing guard on an authenticated
 *    session, not cryptographic security — full sign-in remains the fallback.
 *  - Overnight: at the household's `overnightAt` (local HH:MM) everyone is
 *    fully signed out — clean slate each morning. Re-checked on tab focus so
 *    a device that slept through the time signs out on wake.
 * PIN is verified server-side (verify_user_pin RPC) against a bcrypt hash.
 * Locking also revokes any module PIN-shield grants (shared sessionStorage key).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cutoffDayIndex, parseCutoffMinutes } from "@/lib/overnight";
import { PIN_GRANT_KEY } from "@/components/pin-shield";
import PinPad from "@/components/pin-pad";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "pointerdown"];
const MAX_PIN_TRIES = 5;
const OVERNIGHT_SEEN_KEY = "nestly:overnight-seen";
const LOCK_KEY = "nestly:device-locked";
const ACT_KEY = "nestly:last-activity";
const UNLOCK_BCAST_KEY = "nestly:device-unlock";
const ACT_WRITE_MS = 5_000; // throttle localStorage writes from activity events

export default function IdleLock({
  enabled,
  idleMinutes,
  overnightAt,
  hasPin,
  userName,
  timezone,
}: {
  enabled: boolean;
  idleMinutes: number;
  overnightAt: string | null; // "HH:MM" or null
  hasPin: boolean;
  userName: string;
  timezone: string;
}) {
  const [locked, setLockedState] = useState(false);
  const [tries, setTries] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastActWrite = useRef(0);

  const setLocked = useCallback((v: boolean) => {
    setLockedState(v);
    try {
      if (v) {
        localStorage.setItem(LOCK_KEY, "1");
        sessionStorage.removeItem(PIN_GRANT_KEY); // relock shielded modules too
      } else {
        localStorage.removeItem(LOCK_KEY);
        localStorage.setItem(ACT_KEY, String(Date.now()));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fullSignOut = useCallback(async () => {
    try {
      localStorage.removeItem(LOCK_KEY);
      sessionStorage.removeItem(PIN_GRANT_KEY);
    } catch {
      /* ignore */
    }
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }, []);

  // ── on mount: re-assert a persisted lock (refresh/reopen can't bypass) ──
  useEffect(() => {
    if (!enabled || idleMinutes <= 0) return;
    try {
      const flagged = localStorage.getItem(LOCK_KEY) === "1";
      const storedAct = parseInt(localStorage.getItem(ACT_KEY) ?? "", 10);
      const idleTooLong =
        Number.isFinite(storedAct) && Date.now() - storedAct >= idleMinutes * 60_000;
      if (flagged || idleTooLong) {
        setLockedState(true);
        try {
          localStorage.setItem(LOCK_KEY, "1");
        } catch {
          /* ignore */
        }
      } else if (!Number.isFinite(storedAct)) {
        localStorage.setItem(ACT_KEY, String(Date.now()));
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleMinutes]);

  // ── activity tracking → idle lock ──
  useEffect(() => {
    if (!enabled || idleMinutes <= 0) return;
    const bump = () => {
      if (locked) return;
      lastActivity.current = Date.now();
      if (Date.now() - lastActWrite.current >= ACT_WRITE_MS) {
        lastActWrite.current = Date.now();
        try {
          localStorage.setItem(ACT_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      }
    };
    const persistNow = () => {
      try {
        localStorage.setItem(ACT_KEY, String(lastActivity.current));
      } catch {
        /* ignore */
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    window.addEventListener("pagehide", persistNow);
    const idleMs = idleMinutes * 60_000;
    const iv = setInterval(() => {
      if (!locked && Date.now() - lastActivity.current >= idleMs) {
        setLocked(true);
        setTries(0);
        setErr(null);
      }
    }, 15_000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener("pagehide", persistNow);
      clearInterval(iv);
    };
  }, [enabled, idleMinutes, locked, setLocked]);

  // ── overnight full sign-out (household-local) ──
  useEffect(() => {
    if (!enabled || !overnightAt) return;
    const cutoffMin = parseCutoffMinutes(overnightAt);
    const check = async () => {
      const nowIdx = cutoffDayIndex(new Date(), timezone, cutoffMin);
      let prev: number | null = null;
      try {
        const v = localStorage.getItem(OVERNIGHT_SEEN_KEY);
        const n = v == null ? NaN : parseInt(v, 10);
        prev = Number.isFinite(n) ? n : null;
      } catch {
        /* ignore */
      }
      const remember = (idx: number) => {
        try {
          localStorage.setItem(OVERNIGHT_SEEN_KEY, String(idx));
        } catch {
          /* ignore */
        }
      };
      if (prev == null) {
        remember(nowIdx);
        return;
      }
      if (nowIdx > prev) {
        remember(nowIdx);
        // A session that STARTED after the cut-off must not be killed by it —
        // last_sign_in_at is stable across token refreshes.
        try {
          const { data } = await createClient().auth.getSession();
          const lastSignIn = data.session?.user?.last_sign_in_at;
          if (lastSignIn && cutoffDayIndex(new Date(lastSignIn), timezone, cutoffMin) >= nowIdx)
            return;
        } catch {
          /* fall through to sign-out */
        }
        void fullSignOut();
      } else if (nowIdx < prev) {
        remember(nowIdx);
      }
    };
    const iv = setInterval(() => {
      void check();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    void check();
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, overnightAt, timezone, fullSignOut]);

  // Unlocking one window drops the lock in this user's other tabs too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNLOCK_BCAST_KEY && e.newValue) {
        setLockedState(false);
        setTries(0);
        setErr(null);
        lastActivity.current = Date.now();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const tryUnlock = useCallback(
    async (pinValue: string) => {
      if (busy) return;
      setBusy(true);
      setErr(null);
      const { data, error } = await createClient().rpc("verify_user_pin", { p_pin: pinValue });
      setBusy(false);
      if (error) {
        setErr(error.message);
        return;
      }
      if (data === true) {
        setLocked(false);
        setTries(0);
        lastActivity.current = Date.now();
        try {
          localStorage.setItem(UNLOCK_BCAST_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      } else {
        setTries((t) => {
          const n = t + 1;
          if (n >= MAX_PIN_TRIES) {
            void fullSignOut();
            return n;
          }
          setErr(`Wrong PIN — ${MAX_PIN_TRIES - n} left before full sign-out.`);
          return n;
        });
      }
    },
    [busy, fullSignOut, setLocked]
  );

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-stone-900/90 p-4 backdrop-blur-sm"
    >
      <div className="w-[min(340px,92vw)] rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="text-3xl">🔒</div>
        <div className="mt-1 text-base font-extrabold text-stone-900">Screen locked</div>
        <div className="mb-3 mt-0.5 text-xs text-stone-500">
          {userName ? (
            <>
              Signed in as <strong>{userName}</strong>
            </>
          ) : (
            "Locked for inactivity"
          )}
        </div>
        {hasPin ? (
          <PinPad onSubmit={(p) => void tryUnlock(p)} busy={busy} error={err} hint="Tap your PIN to resume." />
        ) : (
          <div className="mb-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            No PIN set for this account — sign in to continue, then set a PIN under Account →
            Security.
          </div>
        )}
        <button
          type="button"
          onClick={() => void fullSignOut()}
          className="mt-3 w-full rounded-lg border border-red-300 bg-white py-2 text-sm font-bold text-red-700 hover:bg-red-50"
        >
          Switch user / sign in
        </button>
        <span className="sr-only">{tries} failed attempts</span>
      </div>
    </div>
  );
}
