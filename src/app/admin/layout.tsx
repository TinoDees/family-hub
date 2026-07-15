import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/households", label: "Households" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  // Admin requires two-factor: a TOTP factor must exist AND this session
  // must have passed a code check (AAL2).
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal) {
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2")
      redirect("/account/security?next=/admin"); // enrolled — enter code
    if (aal.currentLevel === "aal1" && aal.nextLevel === "aal1")
      redirect("/account/security?next=/admin"); // not enrolled — set up 2FA
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="bg-stone-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-teal-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
              Admin
            </span>
            <span className="text-sm font-semibold">Nestly platform</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-stone-400 sm:inline">
              {admin.email}
            </span>
            <Link
              href="/dashboard"
              className="text-stone-300 underline-offset-2 hover:text-white hover:underline"
            >
              Back to app →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <nav className="w-44 shrink-0">
          <ul className="space-y-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-200 hover:text-stone-900"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
