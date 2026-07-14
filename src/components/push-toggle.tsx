"use client";

import { useCallback, useEffect, useState } from "react";
import { savePushSubscription, deletePushSubscription } from "@/lib/actions/push";

function vapidKeyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

/** "🔔 Notify me" button — subscribes this browser/device to Web Push. */
export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [note, setNote] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const check = useCallback(async () => {
    if (!publicKey) {
      setState("unsupported");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // iPhone/iPad Safari only exposes push inside an installed (Home Screen) app
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setState(ios ? "ios-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("unsupported");
    }
  }, [publicKey]);

  useEffect(() => {
    check();
  }, [check]);

  const enable = async () => {
    setState("busy");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(publicKey!) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setNote(res.error ?? "Could not save");
        setState("off");
        return;
      }
      setState("on");
      setNote("This device will now get message notifications.");
    } catch {
      setNote("Could not enable notifications on this device.");
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("off");
    }
  };

  if (state === "loading" || state === "unsupported") return null;

  if (state === "ios-install") {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">
        🔔 To get message notifications on iPhone/iPad, first install Nestly: Share&nbsp;→ Add&nbsp;to&nbsp;Home&nbsp;Screen,
        then open it from the Home Screen and tap Notify&nbsp;me.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">
        🔕 Notifications are blocked for Nestly in this browser&apos;s settings — allow them there, then reload.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <button
          type="button"
          onClick={disable}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          🔔 Notifications on — turn off
        </button>
      ) : (
        <button
          type="button"
          disabled={state === "busy"}
          onClick={enable}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
        >
          {state === "busy" ? "Working…" : "🔔 Notify me on this device"}
        </button>
      )}
      {note && <span className="text-xs text-stone-500">{note}</span>}
    </div>
  );
}
