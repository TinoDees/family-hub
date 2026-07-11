import { notFound, redirect } from "next/navigation";
import { getModule, modulesForRole } from "@/lib/modules";
import { getMembership } from "@/lib/household";

export const dynamic = "force-dynamic";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  const mod = getModule(slug);
  if (!mod) notFound();

  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  if (!modulesForRole(membership.role).some((m) => m.slug === mod.slug)) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{mod.icon}</span>
        <div>
          <h1 className="text-2xl font-semibold">{mod.name}</h1>
          <p className="text-sm text-stone-500">{mod.description}</p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-6">
        <div className="text-sm font-medium text-stone-700">Coming soon</div>
        <ul className="mt-3 space-y-2">
          {mod.planned.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-stone-600">
              <span className="mt-0.5 text-stone-400">○</span> {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
