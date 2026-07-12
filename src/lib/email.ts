/**
 * Transactional email via Resend (REST API, no SDK dependency).
 * Gated behind env: if RESEND_API_KEY or EMAIL_FROM is missing, sending is
 * skipped and the caller falls back to a copyable invite link.
 */

function emailShell({ title, bodyHtml }: { title: string; bodyHtml: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1c1917;padding:20px 32px;color:#ffffff;font-size:18px;font-weight:bold;">🪺 Nestly</td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">${title}</h1>
          <div style="font-size:14px;line-height:1.6;color:#44403c;">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e;">
          Sent by Nestly — everything your family needs, together.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendInviteEmail({
  to,
  householdName,
  inviterName,
  role,
  inviteUrl,
}: {
  to: string;
  householdName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "email-not-configured" };

  const html = emailShell({
    title: `You're invited to join ${householdName}`,
    bodyHtml: `
      <p>${inviterName} has invited you to join <strong>${householdName}</strong> on Nestly as <strong>${role}</strong>.</p>
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="background:#1c1917;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">View invitation</a>
      </p>
      <p>Nothing happens until you open the page and click Join — so this link is safe to open.</p>
      <p style="color:#a8a29e;">This invite expires in 7 days.</p>`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Join ${householdName} on Nestly`,
      html,
    }),
  });

  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}
