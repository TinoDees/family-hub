"use client";

import { useEffect } from "react";

/**
 * Global double-submit protection: on any form submission, the button that
 * fired it is disabled and shows a working state until the page responds.
 * Mounted once in the root layout — covers every form in the app.
 */
export function FormGuard() {
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const btn = e.submitter;
      if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
      // let the submission (incl. the button's value) go through first
      setTimeout(() => {
        btn.disabled = true;
        btn.dataset.prevHtml = btn.innerHTML;
        btn.style.opacity = "0.6";
        btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> Working…`;
      }, 0);
      // safety valve: if we're still on this page after 20s, unlock
      setTimeout(() => {
        if (document.contains(btn) && btn.disabled) {
          btn.disabled = false;
          btn.style.opacity = "";
          if (btn.dataset.prevHtml) btn.innerHTML = btn.dataset.prevHtml;
        }
      }, 20000);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return (
    <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
  );
}
