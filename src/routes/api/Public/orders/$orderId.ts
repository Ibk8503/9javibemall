import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { authenticatePartnerKey } from "@/lib/api-auth";

export const Route = createFileRoute("/api/Public/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await authenticatePartnerKey(request);
        if (!auth.partnerId) {
          return Response.json({ error: auth.error || "Unauthorized" }, { status: 401 });
        }

        const { orderId } = params;
        if (!orderId) {
          return Response.json({ error: "Missing order ID" }, { status: 400 });
        }

        // Query order by ID
        const { data: order, error } = await supabase
          .from("orders")
          .select(
            "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at, delivery_events(id, order_id, status, note, actor_id, created_at)",
          )
          .eq("id", orderId)
          .maybeSingle();

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        // Multi-Partner Data Isolation: Check if order exists AND belongs to authenticated partner
        if (!order || order.partner_id !== auth.partnerId) {
          return Response.json(
            { error: "Order not found or you do not have permission to access this order." },
            { status: 404 },
          );
        }

        return Response.json({ order });
      },
    },
  },
});
