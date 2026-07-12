import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { AuthCard, inputCls, buttonCls } from "@/components/auth-card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;
  return (
    <AuthCard title="Nestly" subtitle="Sign in to your household" error={error} message={message}>
      <form action={login} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <input name="email" type="email" required placeholder="Email" className={inputCls} />
        <input name="password" type="password" required placeholder="Password" className={inputCls} />
        <button className={buttonCls}>Sign in</button>
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
    </AuthCard>
  );
}
