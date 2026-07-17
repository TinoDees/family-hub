import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/admin";
import { getIosShortcutUrl, saveIosShortcutUrl } from "@/lib/actions/device-setup";

/**
 * Platform admin: the iCloud link to the master "Send to Nestly" Shortcut.
 * When set, /setup-device shows iPhone users a one-tap "Get the Shortcut"
 * button instead of the 8-step manual build. Stored in platform_settings
 * under key 'ios_shortcut_url' (service-role write, authenticated read).
 */
export default async function AdminShortcutPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  const { saved, error } = await searchParams;
  const current = await getIosShortcutUrl();

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">iPhone Shortcut</h1>
        <p className="mt-1 text-sm text-stone-500">
          The shared iCloud link to the master &ldquo;Send to Nestly&rdquo;
          Shortcut. While this is empty, iPhone users on /setup-device are
          pointed at the manual build instructions instead.
        </p>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved — the guided iPhone setup now uses this link.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={saveIosShortcutUrl}
        className="rounded-xl border border-stone-200 bg-white p-5"
      >
        <label className="text-sm font-semibold" htmlFor="url">
          Shortcut iCloud link
        </label>
        <p className="mt-1 text-xs text-stone-500">
          Looks like https://www.icloud.com/shortcuts/… — leave empty and save
          to remove it.
        </p>
        <input
          id="url"
          name="url"
          type="url"
          defaultValue={current ?? ""}
          placeholder="https://www.icloud.com/shortcuts/…"
          className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          Save
        </button>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-700">
        <h2 className="text-sm font-semibold">
          One-time recipe: build &amp; share the master Shortcut
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            On any iPhone, open the <strong>Shortcuts</strong> app → tap{" "}
            <strong>+</strong> → rename it <strong>Send to Nestly</strong>.
          </li>
          <li>
            Tap the <strong>ⓘ</strong> → turn on <strong>Show in Share Sheet</strong>{" "}
            → under Share Sheet Types keep <strong>Images, Text, URLs and
            Media</strong> ticked → Done.
          </li>
          <li>
            Add action <strong>Get Contents of URL</strong>. Leave the URL field
            with a placeholder for now (e.g. paste your own sharing key from
            /account/iphone-sharing). Tap <strong>Show More</strong>: Method →{" "}
            <strong>POST</strong>; Request Body → <strong>Form</strong>; add a
            field of type <strong>File</strong>, name <strong>media</strong>,
            value → <strong>Shortcut Input</strong>.
          </li>
          <li>
            Add action <strong>Open URLs</strong> → set its input to the{" "}
            <strong>open</strong> value from &ldquo;Contents of URL&rdquo; (tap
            the variable → Get Dictionary Value → key: <em>open</em>). Tap{" "}
            <strong>Done</strong>.
          </li>
          <li>
            Long-press the Shortcut → <strong>Share</strong>. In the share
            options, add an <strong>Import Question</strong> on the{" "}
            <strong>URL field</strong> of the Get Contents of URL action.
            Question text: <em>&ldquo;Paste your personal Nestly sharing key
            (copied from the setup page)&rdquo;</em>. This makes Apple prompt
            each person for their own key when they add the Shortcut.
          </li>
          <li>
            Choose <strong>Copy iCloud Link</strong> and paste it into the box
            above. Done — every iPhone user now gets a one-tap install that
            asks them to paste the key /setup-device just put on their
            clipboard.
          </li>
        </ol>
        <p className="mt-3 text-xs text-stone-400">
          If Apple ever invalidates the link (e.g. the Shortcut is edited),
          just re-share and paste the new link here — nothing else changes.
        </p>
      </div>
    </div>
  );
}
