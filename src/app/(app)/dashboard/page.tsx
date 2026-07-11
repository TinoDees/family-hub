import Link from "next/link";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/household";
import { modulesForRole } from "@/lib/modules";

export default async function DashboardPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const modules = modulesForRole(membership.role);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">{membership.household.name}</h1>
      <p className="mt-1 text-sm text-stone-500">
        Invite code:{" "}
        <code className="rounded bg-stone-100 px-2 py-0.5 font-mono text-stone-700">
          {membership.household.invite_code}
        </code>{" "}
        — share it so family members can join.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.slug}
            href={`/${m.slug}`}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="text-2xl">{m.icon}</div>
            <div className="mt-2 font-medium">{m.name}</div>
            <div className="mt-1 text-sm text-stone-500">{m.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
