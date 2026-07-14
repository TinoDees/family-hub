import Image from "next/image";
import Link from "next/link";
import { signup } from "@/lib/actions/auth";
import { inputCls } from "@/components/auth-card";

const perks = [
  "Free during early access — no card needed",
  "Set up your household in minutes",
  "Invite the whole family — adults, kids, even trip guests",
];

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image
                src="/nestly-icon-192.png"
                alt="Nestly"
                width={48}
                height={48}
                className="rounded-xl"
              />
              <span className="text-xl font-semibold tracking-tight text-stone-900">
                Nestly
              </span>
            </Link>
            <h1 className="mt-4 text-xl font-semibold text-stone-900">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Then create or join a household
            </p>
          </div>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <form action={signup} className="space-y-3">
            {next && <input type="hidden" name="next" value={next} />}
            <input name="name" type="text" required placeholder="Your name" className={inputCls} />
            <input name="email" type="email" required placeholder="Email" className={inputCls} />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8 characters)"
              className={inputCls}
            />
            <button className="w-full rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              Sign up — it&apos;s free
            </button>
          </form>
          <ul className="mt-5 space-y-2 border-t border-stone-100 pt-5">
            {perks.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm text-stone-600"
              >
                <span className="mt-0.5 shrink-0 text-teal-600">✓</span>
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-center text-sm text-stone-500">
            Already have an account?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="font-medium text-stone-900 underline"
            >
              Sign in
            </Link>
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-stone-400">
          Curious what launch will cost?{" "}
          <Link href="/pricing" className="underline hover:text-stone-600">
            See pricing
          </Link>
        </p>
      </div>
    </main>
  );
}
