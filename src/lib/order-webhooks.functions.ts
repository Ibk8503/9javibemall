import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dispatchSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["out_for_delivery", "delivered"]),
  orderRef: z.string().trim().max(255).nullable().optional(),
});

type DispatchResult = {
  success: boolean;
  statusCode?: number;
  error?: string;
};

async function createSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const dispatchOrderWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => dispatchSchema.parse(input))
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    const { data: visibleOrder, error: visibleOrderError } = await context.supabase
      .from("orders")
      .select("partner_id, order_ref")
      .eq("id", data.orderId)
      .maybeSingle();

    if (visibleOrderError || !visibleOrder) {
      return { success: false, error: "Order not found or inaccessible" };
    }

    const { data: membership, error: membershipError } = await context.supabase
      .from("partner_members")
      .select("id")
      .eq("partner_id", visibleOrder.partner_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (membershipError || !membership) {
      return { success: false, error: "You are not a member of this partner workspace" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: privateOrder, error: privateOrderError } = await supabaseAdmin
      .from("orders")
      .select("webhook_url, partner_id, order_ref")
      .eq("id", data.orderId)
      .eq("partner_id", visibleOrder.partner_id)
      .maybeSingle();

    const webhookUrl = privateOrder?.webhook_url;
    if (privateOrderError || !privateOrder || !webhookUrl) {
      return { success: true };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch {
      return { success: false, error: "Stored webhook URL is invalid" };
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { success: false, error: "Stored webhook URL must use HTTP or HTTPS" };
    }

    const { data: credentials, error: credentialsError } = await supabaseAdmin
      .from("partner_api_credentials")
      .select("api_key")
      .eq("partner_id", visibleOrder.partner_id)
      .maybeSingle();

    if (credentialsError || !credentials?.api_key) {
      return { success: false, error: "Webhook signing credentials are unavailable" };
    }

    const payload = JSON.stringify({
      order_id: data.orderRef ?? privateOrder.order_ref ?? data.orderId,
      status: data.status,
    });
    const signature = await createSignature(payload, credentials.api_key);
    const headers = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "User-Agent": "9jaVibeMall-Logistics-Webhook/1.0",
    };
    const startedAt = Date.now();
    let responseStatus = 0;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(parsedUrl, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(8000),
      });
      responseStatus = response.status;
      responseBody = await response.text();
      if (!response.ok) errorMessage = `HTTP Error ${response.status}`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Webhook request failed";
    }

    await supabaseAdmin.from("webhook_logs").insert({
      partner_id: visibleOrder.partner_id,
      order_id: data.orderId,
      order_ref: data.orderRef ?? privateOrder.order_ref,
      webhook_url: webhookUrl,
      event: data.status,
      request_headers: headers,
      request_payload: JSON.parse(payload),
      signature,
      response_status: responseStatus,
      response_body: responseBody,
      duration_ms: Date.now() - startedAt,
      error: errorMessage,
    });

    return {
      success: responseStatus >= 200 && responseStatus < 300,
      statusCode: responseStatus,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  });