"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget page-view beacon for marketing/auth pages.
 * Anonymous: a random per-tab session id (sessionStorage), no cookies.
 */
export default function Track({ path }: { path: string }) {
  useEffect(() => {
    try {
      let sid = sessionStorage.getItem("nestly_sid");
      if (!sid) {
        sid = crypto.randomUUID();
        sessionStorage.setItem("nestly_sid", sid);
      }
      const params = new URLSearchParams(window.location.search);
      const payload = JSON.stringify({
        event: "page_view",
        path,
        sid,
        ref: document.referrer || null,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        device: window.innerWidth < 768 ? "mobile" : "desktop",
      });
      const blob = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/track", blob)) {
        fetch("/api/track", { method: "POST", body: payload, keepalive: true }).catch(
          () => {}
        );
      }
    } catch {
      // tracking must never affect the page
    }
  }, [path]);
  return null;
}
