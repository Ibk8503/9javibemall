import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendResendEmail, escapeHtml, emailShell, logSupportEmail } from "./resend.server";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  in_transit: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

/** Email every owner/manager of the order's partner about a delivery status change. */
export const emailManagersDeliveryUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ orderId: z.string().uuid(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("id, partner_id, order_ref, status, dropoff_address, assigned_rider_id, updated_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { sent: false, error: "Order not found" };
    const { data: isMember } = await context.supabase.rpc("is_partner_member", {
      _partner_id: order.partner_id,
      _user_id: context.userId,
    });
    if (!isMember) return { sent: false, error: "Forbidden" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: managers } = await supabaseAdmin
      .from("partner_members")
      .select("user_id")
      .eq("partner_id", order.partner_id)
      .in("role", ["owner", "manager"]);
    const ids = [...new Set([...(managers ?? []).map((m) => m.user_id), context.userId, order.assigned_rider_id].filter(Boolean) as string[])];
    const { data: people } = await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids);
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    const to = (managers ?? []).map((m) => byId.get(m.user_id)?.email).filter((e): e is string => !!e);
    const actor = byId.get(context.userId);
    const rider = order.assigned_rider_id ? byId.get(order.assigned_rider_id) : undefined;
    const label = STATUS_LABEL[order.status] ?? order.status;

    const html = emailShell(
      `Order ${escapeHtml(order.order_ref)} is now ${escapeHtml(label)}`,
      `<table style="font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Status</td><td><strong>${escapeHtml(label)}</strong></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Updated by</td><td>${escapeHtml(actor?.full_name || actor?.email || "Team member")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Rider</td><td>${escapeHtml(rider?.full_name || rider?.email || "Unassigned")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Drop-off</td><td>${escapeHtml(order.dropoff_address)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Time</td><td>${new Date().toUTCString()}</td></tr>
${data.note ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Note</td><td>${escapeHtml(data.note)}</td></tr>` : ""}
</table>`,
    );
    const subject = `[Delivery] ${order.order_ref} – ${label}`;
    const result = await sendResendEmail({
      to,
      subject,
      html,
      idempotencyKey: `delivery-${order.id}-${order.status}-${order.updated_at}`,
    });
    await logSupportEmail({
      kind: "delivery_update",
      subject,
      recipients: to,
      partner_id: order.partner_id,
      order_id: order.id,
      order_ref: order.order_ref,
      body_preview: `${label} · rider ${rider?.full_name || rider?.email || "unassigned"} · drop-off ${order.dropoff_address}${data.note ? ` · note: ${data.note}` : ""}`,
      status: result.sent ? "sent" : "failed",
      error: result.error ?? null,
    });
    return result;
  });

/** Post a reply on an issue. Support replies are emailed to the reporter. */
export const replyToIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ issueId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: issue } = await context.supabase
      .from("issue_reports")
      .select("id, partner_id, reporter_id, description")
      .eq("id", data.issueId)
      .maybeSingle();
    if (!issue) return { ok: false, error: "Report not found" };
    const { data: isSupport } = await context.supabase.rpc("is_platform_support", { _user_id: context.userId });
    const { data: me } = await context.supabase.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const authorName = isSupport ? "9jaVibeMall Support" : me?.full_name || me?.email || "Team member";

    const { error } = await context.supabase.from("issue_replies").insert({
      issue_id: issue.id,
      author_id: context.userId,
      author_name: authorName,
      is_support: !!isSupport,
      body: data.body,
    });
    if (error) return { ok: false, error: error.message };

    let emailed = false;
    if (isSupport) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: mgrs } = await supabaseAdmin
        .from("partner_members")
        .select("user_id")
        .eq("partner_id", issue.partner_id)
        .in("role", ["owner", "manager"]);
      const ids = [...new Set([issue.reporter_id, ...(mgrs ?? []).map((m) => m.user_id)])].filter((id) => id !== context.userId);
      const { data: people } = ids.length
        ? await supabaseAdmin.from("profiles").select("email").in("id", ids)
        : { data: [] as { email: string | null }[] };
      const to = [...new Set((people ?? []).map((p) => p.email).filter((e): e is string => !!e))];
      if (to.length) {
        const r = await sendResendEmail({
          to,
          replyTo: "support@9javibemall.com.ng",
          subject: "Support replied to an issue report",
          html: emailShell(
            "Support replied to a report",
            `<p style="color:#64748b;margin:0 0 6px">Report:</p><p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(issue.description)}</p><p style="color:#64748b;margin:0 0 6px">Reply:</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(data.body)}</p><p style="margin-top:16px">Open the Issues page in the logistics dashboard to respond.</p>`,
          ),
        });
        emailed = r.sent;
        await logSupportEmail({
          kind: "issue_reply",
          subject: "Support replied to an issue report",
          recipients: to,
          reply_to: "support@9javibemall.com.ng",
          partner_id: issue.partner_id,
          issue_id: issue.id,
          body_preview: data.body,
          status: r.sent ? "sent" : "failed",
          error: r.error ?? null,
        });
      }
    }
    return { ok: true, emailed };
  });
