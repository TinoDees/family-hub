"use client";

import { usePathname, useRouter } from "next/navigation";

/** Global back control — every page, every device. Hidden on the dashboard. */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === "/dashboard" || pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/dashboard");
      }}
      title="Back"
      aria-label="Back"
      className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm font-medium hover:bg-stone-100"
    >
      ←
    </button>
  );
}
