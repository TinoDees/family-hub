"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  detectDevicePlatform,
  isStandaloneDisplay,
  type DevicePlatform,
} from "@/lib/device";
import {
  ensureShareTokenForSetup,
  markDeviceSetup,
} from "@/lib/actions/device-setup";
import { InstallButton } from "@/components/install-button";

const PLATFORM_LABEL: Record<DevicePlatform, string> = {
  ios: "iPhone",
  android: "Android",
  desktop: "Computer",
};

function BigCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
    >
      {copied ? "Copied ✓" : "Copy my key"}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">{children}</div>
  );
}

/**
 * Device-aware "Set up your phone" flow. Detects the platform (no OS quiz)
 * and walks the user through the one path that matters for their device:
 * iOS gets Home Screen + the Send-to-Nestly Shortcut, Android gets the PWA
 * install (share target works natively), desktop gets a QR to do it on the
 * phone. A small fallback row lets them switch if detection is wrong.
 */
export function DeviceSetup({ shortcutUrl }: { shortcutUrl: string | null }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<DevicePlatform | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlatform(detectDevicePlatform());
    setStandalone(isStandaloneDisplay());
    setOrigin(window.location.origin);
  }, []);

  // iOS needs the personal sharing key — create/fetch it as soon as we know
  useEffect(() => {
    if (platform !== "ios" || shareUrl) return;
    let cancelled = false;
    ensureShareTokenForSetup().then((res) => {
      if (cancelled) return;
      if (res.ok && res.shareUrl) setShareUrl(res.shareUrl);
      else setTokenError(res.error ?? "Could not create your sharing key");
    });
    return () => {
      cancelled = true;
    };
  }, [platform, shareUrl]);

  const finish = async (status: "completed" | "dismissed") => {
    if (saving) return;
    setSaving(true);
    try {
      await markDeviceSetup(platform ?? "desktop", status);
    } finally {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const doneButton = (
    <button
      type="button"
      disabled={saving}
      onClick={() => finish("completed")}
      className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
    >
      {saving ? "One moment…" : "All done ✓"}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">📲 Let&apos;s set up your phone</h1>
        <p className="mt-1 text-sm text-stone-500">
          Two minutes, once — then sharing recipes, links and photos to Nestly
          just works.
        </p>
      </div>

      {/* wrong-device fallback */}
      {platform !== null && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span>Not your {PLATFORM_LABEL[platform]}? Choose:</span>
          {(["ios", "android", "desktop"] as DevicePlatform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`rounded-full border px-3 py-1 font-medium ${
                platform === p
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-stone-300 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      {platform === null && (
        <Card>
          <p className="text-sm text-stone-400">Checking your device…</p>
        </Card>
      )}

      {platform === "ios" && (
        <>
          {!standalone && (
            <Card>
              <h2 className="text-sm font-semibold">1 · Put Nestly on your Home Screen</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
                <li>
                  In Safari, tap the <strong>Share</strong> button — the square
                  with an arrow pointing up, at the bottom of the screen.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then{" "}
                  <strong>Add</strong>.
                </li>
              </ol>
              <p className="mt-2 text-xs text-stone-400">
                Nestly then opens like a normal app, straight from your Home
                Screen.
              </p>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold">
              {standalone ? "Add the Send-to-Nestly button" : "2 · Add the Send-to-Nestly button"}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              This puts <strong>Send to Nestly</strong> in your share menu —
              see a recipe, screenshot it, share it, done.
            </p>

            {tokenError ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {tokenError}
              </p>
            ) : !shareUrl ? (
              <p className="mt-3 text-sm text-stone-400">Creating your personal key…</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-stone-600">
                    Your personal key (treat it like a password):
                  </p>
                  <code className="mt-1 block truncate rounded-lg bg-stone-100 px-3 py-2 text-xs">
                    {shareUrl}
                  </code>
                </div>
                <BigCopyButton text={shareUrl} />
                {shortcutUrl ? (
                  <div>
                    <a
                      href={shortcutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-lg border-2 border-teal-600 px-4 py-3 text-center text-sm font-semibold text-teal-700 hover:bg-teal-50"
                    >
                      Get the Shortcut →
                    </a>
                    <p className="mt-1.5 text-xs text-stone-500">
                      Apple will ask you to paste the key — paste what you just
                      copied.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">
                    Then follow the{" "}
                    <Link href="/account/iphone-sharing" className="underline">
                      manual setup instructions
                    </Link>{" "}
                    to build the Shortcut (about two minutes).
                  </p>
                )}
              </div>
            )}
          </Card>
          {doneButton}
        </>
      )}

      {platform === "android" && (
        <>
          <Card>
            <h2 className="text-sm font-semibold">Install Nestly</h2>
            <div className="mt-2 rounded-lg border border-stone-200">
              <InstallButton />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Sharing to Nestly works automatically on Android — nothing else to
              set up. After installing, Nestly appears in your share menu.
            </p>
          </Card>
          {doneButton}
        </>
      )}

      {platform === "desktop" && (
        <>
          <Card>
            <h2 className="text-sm font-semibold">Nestly is best with your phone too</h2>
            <p className="mt-1 text-xs text-stone-500">
              Scan this with your phone&apos;s camera to finish setup there:
            </p>
            {origin && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `${origin}/setup-device`
                )}`}
                alt="QR code linking to the phone setup page"
                width={180}
                height={180}
                className="mt-3 rounded-lg border border-stone-200"
              />
            )}
            <p className="mt-3 text-sm text-stone-600">
              …or open <strong>nestlyapp.co</strong> on your phone and sign in —
              it will walk you through the same two-minute setup.
            </p>
          </Card>
          {doneButton}
        </>
      )}

      {platform !== null && (
        <div className="text-center">
          <button
            type="button"
            disabled={saving}
            onClick={() => finish("dismissed")}
            className="text-xs text-stone-400 underline hover:text-stone-600"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
