import Image from "next/image";
import Link from "next/link";

const features = [
  {
    emoji: "💰",
    title: "Family finances",
    body: "Import your bank statements, set budgets, and see exactly where the month went — together, not in one person's spreadsheet.",
  },
  {
    emoji: "🍳",
    title: "Recipes from anywhere",
    body: "Paste a link or share a cooking video and Nestly turns it into a proper recipe — ingredients, steps, photos. Cook mode keeps the screen awake while you work.",
  },
  {
    emoji: "📅",
    title: "Meal planning",
    body: "Plan the week from your own recipe collection. Scale servings up or down and the quantities follow.",
  },
  {
    emoji: "🗓️",
    title: "Family planner",
    body: "One shared calendar for school runs, sport, appointments and birthdays — so everyone knows what's on this week.",
  },
  {
    emoji: "🛒",
    title: "Shopping lists",
    body: "Shared lists the whole family can add to. Whoever's at the shop sees the same list, live.",
  },
  {
    emoji: "🏖️",
    title: "Holidays & trips",
    body: "One hub per trip: itinerary, photos, and every expense. Scan a receipt, split the bill fairly, and settle up per family at the end.",
  },
  {
    emoji: "📸",
    title: "Shared photos",
    body: "Albums for your household and for each trip, with control over who sees what.",
  },
  {
    emoji: "💬",
    title: "Family messages",
    body: "Your own private family chat — plans, photos and “who's picking up the kids?” without another group-chat app.",
  },
  {
    emoji: "🧒",
    title: "Kids welcome",
    body: "Child accounts with parental controls — kids sign in with a simple username, no email address needed.",
  },
];

const steps = [
  {
    n: "1",
    title: "Create your account",
    body: "Sign up with your email — it takes a minute.",
  },
  {
    n: "2",
    title: "Set up your household",
    body: "Give your family a home in Nestly, or join one with an invite code.",
  },
  {
    n: "3",
    title: "Invite your family",
    body: "Adults, kids, even trip guests — everyone gets the right level of access.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Image
            src="/nestly-logo.png"
            alt="Nestly — everything your family needs, together"
            width={216}
            height={81}
            priority
          />
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            Pricing
          </Link>
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
      <section className="mx-auto max-w-3xl px-6 pb-16 pt-14 text-center sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Everything your family needs.{" "}
          <span className="text-teal-600">Together.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
          Nestly is your family&apos;s home base — money, meals, recipes,
          holidays and photos in one private space built for the whole
          household, not just one person&apos;s phone.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Create your household
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
          >
            Log in
          </Link>
        </div>
        <p className="mt-4 text-sm text-stone-400">
          Free while Nestly is in early access.{" "}
          <Link href="/pricing" className="underline hover:text-stone-600">
            See pricing
          </Link>
        </p>
      </section>

      {/* Features */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            One app instead of six group chats
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">
            The stuff every family juggles — organised in one place, shared
            with the right people.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-stone-200 bg-stone-50 p-5"
              >
                <div className="text-2xl">{f.emoji}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is Nestly */}
      <section className="border-t border-stone-200">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-600">
            What is Nestly?
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            A private space for one household — not a social network
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-stone-600">
            Nestly is one shared home for your family&apos;s everyday life —
            no feeds, no followers, no strangers. It was built by a dad for
            his own family first, and it grows from what real households
            actually need. It works on any phone straight from the browser,
            and you can install it to your home screen like a normal app.
          </p>
        </div>
      </section>

      {/* Holidays highlight */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-600">
                Holidays &amp; split the bill
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Group trips without the awkward maths
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Two families, one villa, three weeks of shared dinners —
                who owes whom? Nestly gives every trip its own hub. Snap a
                receipt and it reads the line items, so the family that
                skipped the seafood platter doesn&apos;t pay for it. At the
                end, each family gets one clear statement to settle.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                "Invite guests and other families to a trip — they only see that trip",
                "Receipt scanning reads totals and individual items",
                "Allocate items to exactly who had them",
                "Per-family settlement, reviewed and accepted by each family",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700"
                >
                  <span className="mt-0.5 text-teal-600">✓</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recipes highlight */}
      <section className="border-t border-stone-200">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <ul className="order-2 space-y-3 lg:order-1">
              {[
                "Share a cooking video to Nestly and get a written recipe",
                "Paste a link from almost any recipe site",
                "Scale servings and the meal planner scales with you",
                "Cook mode: big steps, screen stays on",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-700"
                >
                  <span className="mt-0.5 text-teal-600">✓</span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-600">
                Recipes &amp; meals
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                From “saw it on a reel” to “it&apos;s on the table”
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Stop losing recipes in saved-video graveyards. Nestly turns
                videos and links into a family cookbook you can actually
                cook from — then plans the week&apos;s meals around it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Up and running in minutes
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-semibold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{s.body}</p>
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
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-stone-50">
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
