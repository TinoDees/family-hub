import Link from "next/link";

const GUIDES: { icon: string; title: string; steps: string[]; tip?: string }[] = [
  {
    icon: "👨‍👩‍👧",
    title: "Invite an adult to your family",
    steps: [
      "Go to Settings → Invites",
      "Enter their email and choose the role (adult)",
      "They get an email → click it → choose a name and password → they're in",
    ],
    tip: "If they already have a Nestly account (for example from a trip), they just sign in on the invite page instead.",
  },
  {
    icon: "🧒",
    title: "Add a child (no email needed)",
    steps: [
      "Go to Settings → People → “Add a child account” at the bottom",
      "Choose their name, a username (e.g. rosie) and a password",
      "On their device: open nestlyapp.co → Sign in → type just the username and password",
    ],
    tip: "Kids don't get invited by email — you create their account and tell them the username. Parents can see kids' chats by design.",
  },
  {
    icon: "📲",
    title: "Install Nestly on your phone",
    steps: [
      "Android (Chrome): tap “Install app” in the menu — one tap",
      "iPhone: Safari → Share → “Add to Home Screen” → Add",
      "Open Nestly from the home-screen icon, then turn on notifications in Messages (🔔)",
    ],
    tip: "Notifications only work from the installed app, not the browser tab.",
  },
  {
    icon: "💬",
    title: "Messages & chats",
    steps: [
      "The family channel includes everyone; trips have their own channel with your guests",
      "“+ New chat” starts a private 1:1 or group chat",
      "Parents can open (read-only) any chat a child of the family is in — adults' chats stay private",
    ],
  },
  {
    icon: "✈️",
    title: "Trips, guests & splitting bills",
    steps: [
      "Holiday Planner → create a trip → invite guests or whole families by email",
      "Add expenses by scanning receipts — Nestly reads the items and totals",
      "Assign items to who had them; Nestly keeps a fair per-family balance in both currencies",
    ],
  },
  {
    icon: "🍳",
    title: "Recipes from videos & links",
    steps: [
      "Share any cooking video or recipe link to Nestly (or paste it in Recipes)",
      "Nestly writes it up as a proper recipe — ingredients, steps, photos",
      "Scale servings and send the week's plan straight to a shopping list",
    ],
  },
  {
    icon: "🔑",
    title: "Someone forgot their password",
    steps: [
      "Settings → People → open the person → “Send reset email”",
      "They click the link, get signed in, and choose a new password",
      "For kids (no email): use “Set password” and tell them the new one",
    ],
  },
  {
    icon: "🔐",
    title: "Protect your account with 2FA",
    steps: [
      "Go to Account → Security (or nestlyapp.co/account/security)",
      "Set up 2FA → scan the QR code with any authenticator app",
      "From then on, sensitive areas ask for a 6-digit code",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">❓ Help & guides</h1>
        <p className="mt-1 text-sm text-stone-500">
          Short walkthroughs for the things every family does first. Video guides are coming.
        </p>
      </div>
      <div className="space-y-2">
        {GUIDES.map((g) => (
          <details key={g.title} className="rounded-xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
              {g.icon} {g.title}
            </summary>
            <div className="border-t border-stone-100 px-4 py-3">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {g.tip && (
                <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">💡 {g.tip}</p>
              )}
            </div>
          </details>
        ))}
      </div>
      <p className="text-xs text-stone-400">
        Stuck on something not covered here? Message the family owner — or{" "}
        <Link href="/messages" className="underline">ask in the family chat</Link>.
      </p>
    </div>
  );
}
