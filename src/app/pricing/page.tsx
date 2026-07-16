import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Track from "@/components/track";

export const metadata: Metadata = {
  title: "Pricing — Nestly",
  description:
    "Nestly is free during early access. One simple plan for the whole household at launch.",
};

const included = [
  "Family finances with bank-statement import",
  "Recipes from videos and links, with cook mode",
  "Meal planner that scales servings for your family",
  "Family planner calendar for the whole household",
  "Shopping lists everyone can add to",
  "Holidays & trips with receipt-scan split-the-bill",
  "Per-family settlement for shared trips",
  "Shared photo albums for home and travel",
  "Family messages — your own private chat",
  "Parental controls with child accounts (no email needed for kids)",
  "Guest access for friends joining a trip",
];

const faqs = [
  {
    q: "Is it really free?",
    a: "Yes. Everything in Nestly is free while we're in early access — every module, your whole household, no feature gates. Early-access families keep free access until launch.",
  },
  {
    q: "Do I need a credit card?",
    a: "No. There's nothing to enter and nothing that can charge you. You just sign up with your email and set up your household.",
  },
  {
    q: "What happens at launch?",
    a: "The plan becomes A$7.99/month per household, or A$79.90/year (two months free). We'll give every early-access family clear notice before anything changes — you'll never be charged by surprise.",
  },
  {
    q: "Who counts as a household?",
    a: "One household is one family space in Nestly — parents, kids, grandparents, whoever lives your family life together. Unlimited members are included; you don't pay per person.",
  },
  {
    q: "Can other families join our trips?",
    a: "Yes. You can invite guests and other families to a specific trip. They only see that trip — not your household — and it doesn't cost them (or you) anything extra.",
  },
];

function Check() {
  return <span className="mt-0.5 shrink-0 text-teal-600">✓</span>;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Track path="/pricing" />
      {/* Nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/nestly-icon-192.png"
            alt="Nestly"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="text-lg font-semibold tracking-tight">Nestly</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-12 pt-12 text-center sm:pt-16">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          One plan. <span className="text-teal-600">Whole household.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
          Nestly is completely free during early access. Here&apos;s the
          planned price for launch, so nothing ever comes as a surprise.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Early access */}
          <div className="relative rounded-2xl border-2 border-teal-600 bg-white p-8 shadow-sm">
            <span className="absolute -top-3 left-6 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Available now
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600">
              Early access
            </h2>
            <p className="mt-3 text-4xl font-bold tracking-tight">Free</p>
            <p className="mt-1 text-sm text-stone-500">
              For every family that joins now
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-stone-700">
              {[
                "All modules, nothing held back",
                "Unlimited household members",
                "Free access kept until launch",
                "Clear notice before any charge — ever",
                "No credit card required",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check />
                  {line}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 block rounded-lg bg-teal-600 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-teal-700"
            >
              Create your household — free
            </Link>
          </div>

          {/* At launch */}
          <div className="rounded-2xl border border-stone-200 bg-white p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              At launch
            </h2>
            <p className="mt-3 text-4xl font-bold tracking-tight">
              A$7.99
              <span className="text-base font-medium text-stone-500">
                {" "}
                /month per household
              </span>
            </p>
            <p className="mt-1 text-sm text-stone-500">
              or A$79.90/year — two months free
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-stone-700">
              {[
                "One plan — no tiers, no add-ons",
                "The whole household on one subscription",
                "All modules included",
                "Unlimited members",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-8 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Early-access families keep free access until launch and get
              notice before any charge.
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-stone-400">
          Prices in AUD.
        </p>
      </section>

      {/* What's included */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Everything&apos;s included
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">
            No feature gates, no “premium” modules. Every household gets all
            of Nestly.
          </p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {included.map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700"
              >
                <Check />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-stone-200">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Questions, answered
          </h2>
          <div className="mt-10 space-y-4">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-xl border border-stone-200 bg-white p-5"
              >
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-teal-600 px-8 py-3 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Get started — it&apos;s free
            </Link>
            <p className="mt-3 text-sm text-stone-400">
              No card, no catch. Set up your household in minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image
              src="/nestly-icon-192.png"
              alt=""
              width={24}
              height={24}
              className="rounded-md"
            />
            <span className="text-sm font-medium text-stone-600">
              Nestly — everything your family needs. Together.
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-stone-500">
            <Link href="/pricing" className="hover:text-stone-900">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-stone-900">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-stone-900">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
