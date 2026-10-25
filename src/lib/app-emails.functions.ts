import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Welcome email to the signed-in user themselves (once per user). */
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle();
    const { data: member } = await context.supabase
      .from("partner_members").select("role, partners(name)").eq("user_id", context.userId).limit(1).maybeSingle();
    if (!me?.email) return { sent: false };
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const r = await sendTemplateEmail("welcome", me.email, {
        templateData: { name: me.full_name ?? undefined, partnerName: member?.partners?.name, role: member?.role },
        idempotencyKey: `welcome-${context.userId}`,
      });
      return { sent: r.sent };
    } catch (e) {
      console.error("welcome email failed", e);
      return { sent: false };
    }
  });

/** Email the rider assigned to an order. Caller must be an owner/manager of the order's partner. */
export const sendDeliveryAssignedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders").select("id, partner_id, order_ref, pickup_address, dropoff_address, assigned_rider_id")
      .eq("id", data.orderId).maybeSingle();
    if (!order?.assigned_rider_id) return { sent: false };
    const { data: isAdmin } = await context.supabase.rpc("is_partner_admin", { _partner_id: order.partner_id, _user_id: context.userId });
    if (!isAdmin) return { sent: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rider } = await supabaseAdmin.from("profiles").select("email, full_name").eq("id", order.assigned_rider_id).maybeSingle();
    if (!rider?.email) return { sent: false };
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const r = await sendTemplateEmail("delivery-assigned", rider.email, {
        templateData: { riderName: rider.full_name ?? undefined, orderRef: order.order_ref, pickup: order.pickup_address, dropoff: order.dropoff_address },
        idempotencyKey: `delivery-assigned-${order.id}-${order.assigned_rider_id}`,
      });
      return { sent: r.sent };
    } catch (e) {
      console.error("delivery-assigned email failed", e);
      return { sent: false };
    }
  });
