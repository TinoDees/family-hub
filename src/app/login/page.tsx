import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { AuthCard, inputCls } from "@/components/auth-card";
import Track from "@/components/track";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;
  return (
    <AuthCard title="Nestly" subtitle="Sign in to your household" error={error} message={message}>
      <Track path="/login" />
      <form action={login} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <input name="email" type="text" required placeholder="Email or username" autoComplete="username" className={inputCls} />
        <input name="password" type="password" required placeholder="Password" className={inputCls} />
        <button className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
          Sign in
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-500">
        New here?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-medium text-stone-900 underline"
        >
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-stone-400">
        <Link href="/" className="hover:text-stone-600">
          ← Back to home
        </Link>
      </p>
    </AuthCard>
  );
}
