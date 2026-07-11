/**
 * Module registry — single source of truth for nav, dashboard grid,
 * and placeholder pages. Add/remove modules here, nowhere else.
 */
export type MemberRole = "owner" | "adult" | "child";

export type ModuleDef = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  /** Minimum role that can see this module in the nav. */
  minRole: MemberRole;
  /** Planned features shown on the placeholder page. */
  planned: string[];
  status: "placeholder" | "live";
};

export const MODULES: ModuleDef[] = [
  {
    slug: "finance",
    name: "Finance",
    icon: "💰",
    description: "Budgets, transactions and bills — multi-currency with AUD base.",
    minRole: "adult",
    planned: ["Budgets per category", "Transaction ledger", "Bill reminders", "Multi-currency (AUD base)"],
    status: "placeholder",
  },
  {
    slug: "recipes",
    name: "Recipes",
    icon: "🍳",
    description: "Recipe cards for the household cookbook.",
    minRole: "child",
    planned: ["Recipe cards with photos", "Ingredients & steps", "Tags and search"],
    status: "placeholder",
  },
  {
    slug: "meals",
    name: "Meal Planner",
    icon: "📅",
    description: "Weekly Mon–Sun meal planner that feeds the shopping list.",
    minRole: "child",
    planned: ["Mon–Sun weekly grid", "Drag recipes onto days", "Auto-generate shopping list"],
    status: "placeholder",
  },
  {
    slug: "shopping",
    name: "Shopping Lists",
    icon: "🛒",
    description: "Shared lists that sync live across everyone's devices.",
    minRole: "child",
    planned: ["Realtime sync (Supabase Realtime)", "Check-off with who/when", "From meal plan or manual"],
    status: "placeholder",
  },
  {
    slug: "holidays",
    name: "Holiday Planner",
    icon: "✈️",
    description: "Trips, day-by-day itineraries and trip expenses.",
    minRole: "child",
    planned: ["Trips with dates & destination", "Itinerary per day", "Trip expense tracking"],
    status: "placeholder",
  },
  {
    slug: "photos",
    name: "Photo Album",
    icon: "📷",
    description: "Albums linked to trips, or standalone.",
    minRole: "child",
    planned: ["Albums (trip-linked or standalone)", "Upload & captions", "Supabase Storage"],
    status: "placeholder",
  },
  {
    slug: "parental",
    name: "Parental Controls",
    icon: "🛡️",
    description: "Per-child permissions, screen time and approval queue.",
    minRole: "adult",
    planned: ["Per-child module permissions", "Screen-time windows", "Approval queue for requests"],
    status: "placeholder",
  },
  {
    slug: "chores",
    name: "Chores & Allowance",
    icon: "🧹",
    description: "Assignable chores with reward amounts and an allowance ledger.",
    minRole: "child",
    planned: ["Assignable chores + schedule", "Reward amounts", "Allowance ledger per child"],
    status: "placeholder",
  },
  {
    slug: "voice",
    name: "Voice",
    icon: "🎤",
    description: "Talk to the hub — Whisper STT, Claude intent parsing, actions.",
    minRole: "child",
    planned: ["Whisper speech-to-text", "Claude API intent parsing", "Action handlers per module"],
    status: "placeholder",
  },
];

const roleRank: Record<MemberRole, number> = { child: 0, adult: 1, owner: 2 };

export function modulesForRole(role: MemberRole): ModuleDef[] {
  return MODULES.filter((m) => roleRank[role] >= roleRank[m.minRole]);
}

export function getModule(slug: string): ModuleDef | undefined {
  return MODULES.find((m) => m.slug === slug);
}
