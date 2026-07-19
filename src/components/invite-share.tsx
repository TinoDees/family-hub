"use client";

/**
 * Share an invite through the inviter's own channels — WhatsApp deep link
 * (straight into a chat with the invitee when we have their number), SMS
 * fallback, plain copy. No SMS gateway, no cost: your phone does the sending.
 */
export function InviteShare({
  token,
  phone,
  householdName,
  inviterName,
}: {
  token: string;
  phone: string | null;
  householdName: string;
  inviterName: string;
}) {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${token}`;
  const message = `${inviterName} invited you to join "${householdName}" on Nestly — tap to join: ${url}`;
  const encoded = encodeURIComponent(message);

  const btn =
    "rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-stone-100";

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}
        title={phone ? "Open WhatsApp chat with this number" : "Share via WhatsApp"}
      >
        WhatsApp
      </a>
      {phone && (
        <a
          href={`sms:+${phone}?body=${encoded}`}
          className={`${btn} border-stone-300 text-stone-600`}
          title="Send as SMS from your phone"
        >
          SMS
        </a>
      )}
    </span>
  );
}
