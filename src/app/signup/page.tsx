import Link from "next/link";
import { signup } from "@/lib/actions/auth";
import { AuthCard, inputCls, buttonCls } from "@/components/auth-card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthCard title="Create your account" subtitle="Then create or join a household" error={error}>
      <form action={signup} className="space-y-3">
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
        <button className={buttonCls}>Sign up</button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-stone-900 underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
