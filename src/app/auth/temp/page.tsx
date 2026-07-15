"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth-card";

function TempLogin() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const email = params.get("email");
    const tmp = params.get("tmp");
    // strip credentials from the address bar / history immediately
    window.history.replaceState({}, "", "/auth/temp");
    if (!email || !tmp) {
      setError("This link is incomplete — ask for a new reset email.");
      return;
    }
    const supabase = createClient();
    supabase.auth.signInWithPassword({ email, password: tmp }).then(({ error }) => {
      if (error) {
        setError(
          "This sign-in link has expired or was already used. Ask your family owner to send a new one."
        );
        return;
      }
      window.location.assign("/account/set-password");
    });
  }, [params]);

  return (
    <AuthCard title={error ? "Link problem" : "Signing you in…"} error={error ?? undefined}>
      {error ? (
        <p className="text-center text-sm text-stone-500">
          <Link href="/login" className="underline">Go to sign in</Link>
        </p>
      ) : (
        <p className="text-center text-sm text-stone-400">One moment…</p>
      )}
    </AuthCard>
  );
}

export default function TempLoginPage() {
  return (
    <Suspense>
      <TempLogin />
    </Suspense>
  );
}
