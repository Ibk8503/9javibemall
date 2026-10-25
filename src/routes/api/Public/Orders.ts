import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { authenticatePartnerKey } from "@/lib/api-auth";

export const Route = createFileRoute("/api/Public/Orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticatePartnerKey(request);
          if (!auth.partnerId) {
            return Response.json({ error: auth.error || "Unauthorized" }, { status: 401 });
          }

          const body = await request.json();
          const {
            order_ref,
            pickup_address,
            pickup_contact_name,
            pickup_contact_phone,
            dropoff_address,
            dropoff_contact_name,
            dropoff_contact_phone,
            items,
            webhook_url,
          } = body;

          // Validation
          if (!order_ref || typeof order_ref !== "string") {
            return Response.json(
              { error: "Missing or invalid required field: order_ref" },
              { status: 400 },
            );
          }
          if (!pickup_address || typeof pickup_address !== "string") {
            return Response.json(
              { error: "Missing or invalid required field: pickup_address" },
              { status: 400 },
            );
          }
          if (!dropoff_address || typeof dropoff_address !== "string") {
            return Response.json(
              { error: "Missing or invalid required field: dropoff_address" },
              { status: 400 },
            );
          }

          // Validate Webhook URL if provided
          if (webhook_url && typeof webhook_url === "string") {
            try {
              new URL(webhook_url);
            } catch {
              return Response.json(
                { error: "Invalid webhook_url format. Must be a valid HTTP/HTTPS URL." },
                { status: 400 },
              );
            }
          }

          // Create order strictly scoped to authenticated partner_id using SECURITY DEFINER procedure
          let order = null;
          try {
            const { data: rpcOrder, error: rpcError } = await (supabase.rpc as any)(
              "create_partner_order",
              {
                _partner_id: auth.partnerId,
                _order_ref: order_ref.trim(),
                _pickup_address: pickup_address.trim(),
                _pickup_contact_name: pickup_contact_name
                  ? String(pickup_contact_name).trim()
                  : null,
                _pickup_contact_phone: pickup_contact_phone
                  ? String(pickup_contact_phone).trim()
                  : null,
                _dropoff_address: dropoff_address.trim(),
                _dropoff_contact_name: dropoff_contact_name
                  ? String(dropoff_contact_name).trim()
                  : null,
                _dropoff_contact_phone: dropoff_contact_phone
                  ? String(dropoff_contact_phone).trim()
                  : null,
                _items: items ? String(items).trim() : null,
                _webhook_url: webhook_url ? webhook_url.trim() : null,
              },
            );

            if (!rpcError && rpcOrder) {
              order = rpcOrder;
            } else if (rpcError) {
              console.warn("RPC create_partner_order error, trying direct insert fallback:", rpcError);
            }
          } catch (err) {
            console.warn("RPC invocation error:", err);
          }

          // Fallback direct query if RPC is not deployed yet
          if (!order) {
            const { data: directOrder, error: insertError } = await supabase
              .from("orders")
              .insert({
                partner_id: auth.partnerId,
                order_ref: order_ref.trim(),
                pickup_address: pickup_address.trim(),
                pickup_contact_name: pickup_contact_name
                  ? String(pickup_contact_name).trim()
                  : null,
                pickup_contact_phone: pickup_contact_phone
                  ? String(pickup_contact_phone).trim()
                  : null,
                dropoff_address: dropoff_address.trim(),
                dropoff_contact_name: dropoff_contact_name
                  ? String(dropoff_contact_name).trim()
                  : null,
                dropoff_contact_phone: dropoff_contact_phone
                  ? String(dropoff_contact_phone).trim()
                  : null,
                items: items ? String(items).trim() : null,
                status: "pending",
                webhook_url: webhook_url ? webhook_url.trim() : null,
              })
              .select(
                "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at",
              )
              .single();

            if (insertError) {
              return Response.json({ error: insertError.message }, { status: 500 });
            }
            order = directOrder;

            // Create initial delivery event
            await supabase.from("delivery_events").insert({
              order_id: order.id,
              status: "pending",
              note: "Order created via Partner API feed",
            });
          }

          // Order confirmation to the partner's owner (one recipient). Never blocks the API response.
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: owner } = await supabaseAdmin
              .from("partner_members").select("user_id").eq("partner_id", auth.partnerId)
              .eq("role", "owner").order("created_at", { ascending: true }).limit(1).maybeSingle();
            const { data: prof } = owner
              ? await supabaseAdmin.from("profiles").select("email").eq("id", owner.user_id).maybeSingle()
              : { data: null };
            const o = order as { id: string; order_ref: string; pickup_address: string; dropoff_address: string; items: string | null };
            if (prof?.email && o?.id) {
              const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
              await sendTemplateEmail("order-confirmation", prof.email, {
                templateData: { orderRef: o.order_ref, pickup: o.pickup_address, dropoff: o.dropoff_address, items: o.items ?? undefined },
                idempotencyKey: `order-confirmation-${o.id}`,
              });
            }
          } catch (e) {
            console.error("order confirmation email failed", e);
          }

          return Response.json({ success: true, order }, { status: 201 });
        } catch (err) {
          return Response.json(
            { error: "Invalid JSON request payload: " + (err as Error).message },
            { status: 400 },
          );
        }
      },

      GET: async ({ request }) => {
        const auth = await authenticatePartnerKey(request);
        if (!auth.partnerId) {
          return Response.json({ error: auth.error || "Unauthorized" }, { status: 401 });
        }

         const { data: orders, error } = await supabase
          .from("orders")
           .select(
             "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at",
           )
          .eq("partner_id", auth.partnerId)
          .order("created_at", { ascending: false });

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ orders });
      },
    },
  },
});
