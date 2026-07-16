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

export async function sendLoginLinkEmail({
  to,
  name,
  loginUrl,
}: {
  to: string;
  name: string;
  loginUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "email-not-configured" };

  const html = emailShell({
    title: "Your new Nestly sign-in",
    bodyHtml: `
      <p>Hi ${name},</p>
      <p>A new sign-in was set up for your Nestly account. Click the button below —
      you'll be signed in and asked to choose your own password.</p>
      <p style="margin:24px 0;">
        <a href="${loginUrl}" style="background:#0d9488;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Sign in &amp; set your password</a>
      </p>
      <p style="color:#a8a29e;">If you didn't ask for this, you can ignore this email — your old password no longer works, so ask your family owner to send a fresh link.</p>`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Set your new Nestly password", html }),
  });
  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}


/* ------------------------- daily health report ------------------------- */

const STATUS_META: Record<string, { emoji: string; color: string }> = {
  ok: { emoji: "\u{1F7E2}", color: "#0d9488" },
  warn: { emoji: "\u{1F7E1}", color: "#d97706" },
  alert: { emoji: "\u{1F534}", color: "#dc2626" },
  skip: { emoji: "\u26AA", color: "#a8a29e" },
};

export async function sendHealthReportEmail(
  report: import("@/lib/health").HealthReport
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!key || !from) return { sent: false, reason: "email-not-configured" };
  if (!to) return { sent: false, reason: "ADMIN_ALERT_EMAIL not set" };

  const meta = STATUS_META[report.status] ?? STATUS_META.ok;
  const g = report.growth;
  const f = report.funnel;
  const s = report.security;

  const row = (label: string, value: string | number) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#78716c;">${label}</td><td style="padding:4px 0;font-weight:bold;color:#1c1917;">${value}</td></tr>`;

  const checksHtml = report.checks
    .map((c) => {
      const m = STATUS_META[c.status] ?? STATUS_META.skip;
      return `<tr>
        <td style="padding:6px 8px 6px 0;white-space:nowrap;">${m.emoji} <strong>${c.name}</strong></td>
        <td style="padding:6px 0;color:#44403c;">${c.summary}${c.detail ? `<br/><span style="color:#a8a29e;font-size:12px;">${c.detail}</span>` : ""}</td>
      </tr>`;
    })
    .join("");

  const html = emailShell({
    title: `${meta.emoji} Daily health \u2014 ${report.status.toUpperCase()}`,
    bodyHtml: `
      <h2 style="font-size:14px;margin:0 0 8px;color:${meta.color};">Growth (last 24h)</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px;">
        ${row("New signups", g.new_users_24h)}
        ${row("New households", g.new_households_24h)}
        ${row("Account deletions (opt-outs)", g.account_deletions_24h)}
        ${row("Total users", `${g.total_users} (${g.new_users_7d} this week)`)}
      </table>
      <h2 style="font-size:14px;margin:0 0 8px;color:${meta.color};">Funnel (last 24h)</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px;">
        ${row("Landing visitors", f.landing_visitors_24h)}
        ${row("Reached signup page", f.signup_page_views_24h)}
        ${row("Completed signup", f.signups_completed_24h)}
        ${row("Visited but didn't proceed", f.bounced_visitors_24h)}
        ${row("Visit \u2192 signup", f.visit_to_signup_pct === null ? "\u2014" : `${f.visit_to_signup_pct}%`)}
      </table>
      <h2 style="font-size:14px;margin:0 0 8px;color:${meta.color};">Security (last 24h)</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px;">
        ${row("Failed logins", `${s.failed_logins_24h} (avg ${s.failed_logins_daily_avg_7d}/day)`)}
        ${row("Failed signups", s.failed_signups_24h)}
        ${row("Bad webhook signatures", s.bad_webhook_signatures_24h)}
      </table>
      ${
        s.notes.length > 0
          ? `<p style="background:#fef2f2;border-radius:8px;padding:12px;color:#b91c1c;font-size:13px;">${s.notes.join("<br/>")}</p>`
          : ""
      }
      <h2 style="font-size:14px;margin:0 0 8px;color:${meta.color};">Services</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;">${checksHtml}</table>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e;">Full history at /admin/health.</p>`,
  });

  const date = new Date(report.run_at).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${meta.emoji} Nestly health ${report.status.toUpperCase()} \u2014 ${date} \u2014 ${g.new_users_24h} signup(s)`,
      html,
    }),
  });
  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}
