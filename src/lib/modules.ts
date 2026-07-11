/**
 * Module registry — single source of truth for nav, dashboard grid,
 * placeholder pages AND permission defaults. Add/remove modules here only.
 *
 * Access model (Tracey-style, family-sized):
 *   effective access = per-member override row in module_permissions
 *                      ?? the member's role default below.
 */
export type MemberRole = "owner" | "adult" | "child";
export type Access = "none" | "view" | "edit";

export const ACCESS_RANK: Record<Access, number> = { none: 0, view: 1, edit: 2 };

export type ModuleDef = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  planned: string[];
  status: "placeholder" | "live";
  /** Default access per role; overridable per member in Settings. */
  defaults: Record<MemberRole, Access>;
};

export const MODULES: ModuleDef[] = [
  {
    slug: "finance",
    name: "Finance",
    icon: "💰",
    description: "Budgets, transactions and bills — multi-currency with AUD base.",
    planned: ["Bill reminders", "Bank feeds (Basiq)", "Multi-currency conversion"],
    status: "live",
    defaults: { owner: "edit", adult: "edit", child: "none" },
  },
  {
    slug: "recipes",
    name: "Recipes",
    icon: "🍳",
    description: "Recipe cards for the household cookbook.",
    planned: ["Recipe cards with photos", "Ingredients & steps", "Tags and search"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "view" },
  },
  {
    slug: "meals",
    name: "Meal Planner",
    icon: "📅",
    description: "Weekly Mon–Sun meal planner that feeds the shopping list.",
    planned: ["Mon–Sun weekly grid", "Drag recipes onto days", "Auto-generate shopping list"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "view" },
  },
  {
    slug: "shopping",
    name: "Shopping Lists",
    icon: "🛒",
    description: "Shared lists that sync live across everyone's devices.",
    planned: ["Realtime sync (Supabase Realtime)", "Check-off with who/when", "From meal plan or manual"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "edit" },
  },
  {
    slug: "holidays",
    name: "Holiday Planner",
    icon: "✈️",
    description: "Trips, day-by-day itineraries and trip expenses.",
    planned: ["Trips with dates & destination", "Itinerary per day", "Trip expense tracking"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "view" },
  },
  {
    slug: "photos",
    name: "Photo Album",
    icon: "📷",
    description: "Albums linked to trips, or standalone.",
    planned: ["Albums (trip-linked or standalone)", "Upload & captions", "Supabase Storage"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "edit" },
  },
  {
    slug: "parental",
    name: "Parental Controls",
    icon: "🛡️",
    description: "Per-child permissions, screen time and approval queue.",
    planned: ["Per-child module permissions", "Screen-time windows", "Approval queue for requests"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "none" },
  },
  {
    slug: "chores",
    name: "Chores & Allowance",
    icon: "🧹",
    description: "Assignable chores with reward amounts and an allowance ledger.",
    planned: ["Assignable chores + schedule", "Reward amounts", "Allowance ledger per child"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "view" },
  },
  {
    slug: "voice",
    name: "Voice",
    icon: "🎤",
    description: "Talk to the hub — Whisper STT, Claude intent parsing, actions.",
    planned: ["Whisper speech-to-text", "Claude API intent parsing", "Action handlers per module"],
    status: "placeholder",
    defaults: { owner: "edit", adult: "edit", child: "view" },
  },
];

export function getModule(slug: string): ModuleDef | undefined {
  return MODULES.find((m) => m.slug === slug);
}
