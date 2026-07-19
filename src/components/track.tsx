"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget page-view beacon for marketing/auth pages.
 * Anonymous: a random per-tab session id (sessionStorage), no tracking cookies.
 *
 * Attribution: on first touch we also set a first-party `nestly_attrib`
 * cookie (30 days) holding the UTM params, referrer and landing path.
 * The signup server action reads it once to record where the account
 * came from (signup_attributions), then it is never used again.
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

      // First-touch attribution cookie: only if not already set, and only
      // when there is something worth recording (a UTM tag or a referrer).
      if (!document.cookie.includes("nestly_attrib=")) {
        const attrib = {
          s: params.get("utm_source"),
          m: params.get("utm_medium"),
          c: params.get("utm_campaign"),
          co: params.get("utm_content"),
          t: params.get("utm_term"),
          r: document.referrer || null,
          l: path,
        };
        if (attrib.s || attrib.r) {
          document.cookie =
            "nestly_attrib=" +
            encodeURIComponent(JSON.stringify(attrib)) +
            ";max-age=2592000;path=/;SameSite=Lax";
        }
      }

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
