export const EMAIL_FROM = "9jaVibeMall Logistics <noreply@9javibemall.com.ng>";

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendResendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  idempotencyKey?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) return { sent: false, error: "Email is not configured" };
  if (!opts.to.length) return { sent: false, error: "No recipients" };
  // On Lovable hosting the call is proxied through the connector gateway (which
  // needs LOVABLE_API_KEY); anywhere else we talk to Resend directly, so a
  // RESEND_API_KEY on its own is enough.
  const endpoint = lovableKey
    ? "https://connector-gateway.lovable.dev/resend/emails"
    : "https://api.resend.com/emails";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey ?? resendKey}`,
      ...(lovableKey ? { "X-Connection-Api-Key": resendKey } : {}),
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.error(`resend send failed [${res.status}]: ${await res.text()}`);
    return { sent: false, error: "Email could not be sent" };
  }
  return { sent: true };
}

export const emailShell = (title: string, body: string) =>
  `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f172a"><h2 style="margin:0 0 12px;color:#F2751A">${title}</h2>${body}<p style="margin-top:24px;font-size:12px;color:#64748b">9jaVibeMall Logistics · support@9javibemall.com.ng</p></div>`;

export type EmailLogEntry = {
  kind: "issue_report" | "issue_reply" | "delivery_update";
  subject: string;
  recipients: string[];
  reply_to?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
  order_id?: string | null;
  order_ref?: string | null;
  issue_id?: string | null;
  body_preview?: string | null;
  status: "sent" | "failed";
  error?: string | null;
};

/** Record an outbound support email so the Support Desk can show it. Never throws. */
export async function logSupportEmail(entry: EmailLogEntry) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("support_emails").insert({
      kind: entry.kind,
      subject: entry.subject,
      recipients: entry.recipients,
      reply_to: entry.reply_to ?? null,
      partner_id: entry.partner_id ?? null,
      partner_name: entry.partner_name ?? null,
      order_id: entry.order_id ?? null,
      order_ref: entry.order_ref ?? null,
      issue_id: entry.issue_id ?? null,
      body_preview: entry.body_preview ? entry.body_preview.slice(0, 600) : null,
      status: entry.status,
      error: entry.error ?? null,
    });
  } catch (e) {
    console.error("support email log failed", e);
  }
}
