import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { createShareToken, deleteShareToken } from "@/lib/actions/share-tokens";
import { CopyButton } from "@/components/copy-button";

/**
 * iPhone sharing setup. iOS never shows installed web apps in the share sheet
 * (no Web Share Target on Safari), so iPhone users get an Apple Shortcut that
 * POSTs shared content to /api/share-in with their personal key. One-time
 * setup, written so a helper (Tino) can do it on someone else's phone.
 */
export default async function IphoneSharingPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tokenRow } = await supabase
    .from("share_tokens")
    .select("token, created_at, last_used_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "nestlyapp.co";
  const shareUrl = tokenRow ? `https://${host}/api/share-in?token=${tokenRow.token}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">📲 Share to Nestly on iPhone</h1>
        <p className="mt-1 text-sm text-stone-500">
          iPhones don&apos;t let web apps appear in the share menu — so we add Nestly there with an
          Apple Shortcut instead. Set it up once (two minutes); after that, &ldquo;Send to
          Nestly&rdquo; shows up everywhere you can share a photo, text or link.
        </p>
        <p className="mt-2 text-xs text-stone-400">
          Prefer the guided version? <Link href="/setup-device" className="underline">Set up your phone</Link> walks you through it — the steps below are the manual fallback.
        </p>
      </div>

      {!tokenRow ? (
        <form action={createShareToken} className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">
            First, create your personal sharing key. It lets the Shortcut send things to your
            household — keep it to yourself.
          </p>
          <button className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            Create my sharing key
          </button>
        </form>
      ) : (
        <>
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold">1 · Your personal sharing address</h2>
            <p className="mt-1 text-xs text-stone-500">
              You&apos;ll paste this into the Shortcut in step 2. Treat it like a password.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2 text-xs">
                {shareUrl}
              </code>
              <CopyButton text={shareUrl!} />
            </div>
            {tokenRow.last_used_at && (
              <p className="mt-2 text-xs text-emerald-600">
                ✓ Last used {new Date(tokenRow.last_used_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} — it&apos;s working.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-700">
            <h2 className="text-sm font-semibold">2 · Build the Shortcut (on the iPhone, once)</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Open the <strong>Shortcuts</strong> app (it&apos;s on every iPhone) → tap <strong>+</strong>.</li>
              <li>Tap the name at the top → rename it <strong>Send to Nestly</strong>.</li>
              <li>Tap the <strong>ⓘ</strong> at the bottom → turn on <strong>Show in Share Sheet</strong> → under &ldquo;Share Sheet Types&rdquo; keep <strong>Images, Text, URLs and Media</strong> ticked → Done.</li>
              <li>Add action → search <strong>Get Contents of URL</strong> → tap it.</li>
              <li>Tap the pale &ldquo;URL&rdquo; field → paste the sharing address from step 1.</li>
              <li>Tap <strong>Show More</strong>: Method → <strong>POST</strong>; Request Body → <strong>Form</strong>; add a field: type <strong>File</strong>, name it <strong>media</strong>, value → <strong>Shortcut Input</strong>.</li>
              <li>Add one more action → search <strong>Open URLs</strong> → set its input to the <strong>open</strong> value from &ldquo;Contents of URL&rdquo; (tap the variable → Get Dictionary Value → key: <em>open</em>).</li>
              <li>Tap <strong>Done</strong>. Finished — it never needs touching again.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-5 text-sm text-teal-900">
            <h2 className="text-sm font-semibold">3 · How she uses it (the only bit to remember)</h2>
            <p className="mt-1">
              See a recipe → <strong>screenshot it</strong> → open the screenshot → tap{" "}
              <strong>Share</strong> → <strong>Send to Nestly</strong>. Nestly opens with the recipe
              already read — she just taps <strong>Save</strong>. Links and copied text work through
              the same button too.
            </p>
          </div>

          <form action={deleteShareToken}>
            <button className="text-xs text-stone-400 underline hover:text-red-600">
              Remove my sharing key (the Shortcut stops working)
            </button>
          </form>
        </>
      )}
    </div>
  );
}
