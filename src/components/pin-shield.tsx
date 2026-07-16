"use client";

/**
 * PIN shield for sensitive modules (Finance, Manage People, Parental
 * Controls — flagged `pinShield` in the module registry). Shown ON TOP of the
 * permission layer: you must already be allowed to open the module; the PIN
 * is a shared-device shoulder-surfing guard, same philosophy as the idle
 * lock. One successful PIN unlocks all shielded modules for this tab until
 * the idle lock fires, the tab closes, or the user signs out (grant is keyed
 * to the user id in sessionStorage).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PinPad from "@/components/pin-pad";

export const PIN_GRANT_KEY = "nestly:pin-grant";

export default function PinShield({
  moduleName,
  userId,
  hasPin,
  children,
}: {
  moduleName: string;
  userId: string;
  hasPin: boolean;
  children: React.ReactNode;
}) {
  // null = not yet checked (avoids a hydration flash)
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem(PIN_GRANT_KEY) === userId);
    } catch {
      setUnlocked(false);
    }
  }, [userId]);

  const tryUnlock = useCallback(
    async (pin: string) => {
      if (busy) return;
      setBusy(true);
      setErr(null);
      const { data, error } = await createClient().rpc("verify_user_pin", { p_pin: pin });
      setBusy(false);
      if (error) {
        setErr(error.message);
        return;
      }
      if (data === true) {
        try {
          sessionStorage.setItem(PIN_GRANT_KEY, userId);
        } catch {
          /* ignore */
        }
        setUnlocked(true);
      } else {
        setErr("Wrong PIN — try again.");
      }
    },
    [busy, userId]
  );

  if (unlocked) return <>{children}</>;
  if (unlocked === null) return null;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-[min(340px,92vw)] rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">🔐</div>
        <div className="mt-1 text-base font-extrabold text-stone-900">{moduleName} is protected</div>
        <div className="mb-3 mt-0.5 text-xs text-stone-500">
          Enter your PIN to open it on this device.
        </div>
        {hasPin ? (
          <PinPad onSubmit={(p) => void tryUnlock(p)} busy={busy} error={err} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            You haven&apos;t set a PIN yet.{" "}
            <Link href="/account/security" className="font-semibold underline">
              Set your 4 or 6 digit PIN
            </Link>{" "}
            to open {moduleName}.
          </div>
        )}
      </div>
    </div>
  );
}
