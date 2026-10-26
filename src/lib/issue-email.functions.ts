import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logSupportEmail } from "./resend.server";

const SUPPORT = "support@9javibemall.com.ng";
const FROM = "9jaVibeMall Logistics <noreply@9javibemall.com.ng>";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const emailIssueToSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ issueId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: only the reporter (or partner admins) can read this report.
    const { data: issue, error } = await context.supabase
      .from("issue_reports")
      .select("id, reporter_id, description, recommendation, status, created_at, partners(name, partner_code), orders(order_ref, status, dropoff_address)")
      .eq("id", data.issueId)
      .maybeSingle();
    if (error || !issue) return { sent: false, error: "Report not found" };
    if (issue.reporter_id !== context.userId) return { sent: false, error: "Only the reporter can send this" };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: member } = await context.supabase
      .from("partner_members")
      .select("role")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();

    const reporter = profile?.full_name || profile?.email || "Team member";
    const orderRef = issue.orders?.order_ref ?? "None";
    const row = (k: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0;color:#0f172a"><strong>${esc(v)}</strong></td></tr>`;
    const html = `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f172a">
<h2 style="margin:0 0 12px;color:#F2751A">New issue report</h2>
<table style="font-size:14px">${row("Partner", `${issue.partners?.name ?? ""} (${issue.partners?.partner_code ?? ""})`)}${row("Reported by", `${reporter} · ${member?.role ?? ""}`)}${row("Reporter email", profile?.email ?? "")}${row("Order", orderRef)}${issue.orders ? row("Order status", issue.orders.status) + row("Drop-off", issue.orders.dropoff_address) : ""}${row("Submitted", new Date(issue.created_at).toUTCString())}</table>
<h3 style="margin:20px 0 6px">Issue</h3><p style="white-space:pre-wrap;margin:0">${esc(issue.description)}</p>
${issue.recommendation ? `<h3 style="margin:20px 0 6px">AI-recommended next steps</h3><p style="white-space:pre-wrap;margin:0;color:#334155">${esc(issue.recommendation.replace(/\*\*/g, "").replace(/^#+\s*/gm, ""))}</p>` : ""}
</div>`;

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) return { sent: false, error: "Email is not configured" };

    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
        "Idempotency-Key": `issue-report-${issue.id}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT],
        ...(profile?.email ? { reply_to: profile.email } : {}),
        subject: `[Issue] ${orderRef !== "None" ? orderRef + " – " : ""}${issue.description.slice(0, 60)}`,
        html,
      }),
    });
    const subject = `[Issue] ${orderRef !== "None" ? orderRef + " – " : ""}${issue.description.slice(0, 60)}`;
    if (!res.ok) {
      console.error(`issue email failed [${res.status}]: ${await res.text()}`);
      await logSupportEmail({
        kind: "issue_report",
        subject,
        recipients: [SUPPORT],
        reply_to: profile?.email ?? null,
        issue_id: issue.id,
        partner_name: issue.partners?.name ?? null,
        order_ref: orderRef === "None" ? null : orderRef,
        body_preview: issue.description,
        status: "failed",
        error: "Support email could not be sent",
      });
      return { sent: false, error: "Support email could not be sent" };
    }
    await context.supabase.from("issue_reports").update({ emailed_at: new Date().toISOString() }).eq("id", issue.id);
    await logSupportEmail({
      kind: "issue_report",
      subject,
      recipients: [SUPPORT],
      reply_to: profile?.email ?? null,
      issue_id: issue.id,
      partner_name: issue.partners?.name ?? null,
      order_ref: orderRef === "None" ? null : orderRef,
      body_preview: issue.description,
      status: "sent",
    });
    return { sent: true };
  });
