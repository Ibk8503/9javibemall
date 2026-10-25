/**
 * Webhook Dispatcher & Inspector for 9jaVibeMall Logistics Hub
 * Handles sending signed webhook notifications asynchronously when order status updates
 * and logging all dispatch attempts, payloads, signatures, and responses for inspection.
 */

import { supabase } from "@/integrations/supabase/client";

export interface WebhookPayload {
  order_id: string;
  status: string;
  [key: string]: any;
}

export interface WebhookDispatchLog {
  id: string;
  partner_id?: string | null;
  order_id: string;
  order_ref?: string | null;
  webhook_url: string;
  event: string;
  request_headers: Record<string, string>;
  request_payload: WebhookPayload;
  signature: string;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number;
  error?: string | null;
  created_at: string;
}

// In-memory buffer of recent logs for instant frontend reactivity & fallbacks
const localWebhookLogs: WebhookDispatchLog[] = [];
const MAX_LOCAL_LOGS = 100;

export function getLocalWebhookLogs(): WebhookDispatchLog[] {
  return [...localWebhookLogs];
}

/**
 * Generate a SHA-256 HMAC signature string for a webhook payload string using the partner's secret API key
 */
export async function generateWebhookSignature(jsonPayload: string, secretKey?: string): Promise<string> {
  const secret = secretKey || "";
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await window.crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        encoder.encode(jsonPayload)
      );
      const hashArray = Array.from(new Uint8Array(signatureBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (err) {
      console.warn("[Webhook Signature WebCrypto Error]:", err);
    }
  }

  // Fallback / Node environment
  try {
    const cryptoModule = await import("node:crypto");
    return cryptoModule.createHmac("sha256", secret).update(jsonPayload).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Dispatch webhook asynchronously in a non-blocking fire-and-forget fashion,
 * and persist complete dispatch logs with payload & response.
 */
export async function dispatchOrderWebhook(
  webhookUrl: string | null | undefined,
  orderId: string,
  status: string,
  options?: {
    partnerId?: string | null | undefined;
    orderRef?: string | null | undefined;
    secretKey?: string | null | undefined;
    throwOnError?: boolean;
  },
): Promise<{
  success: boolean;
  signature?: string;
  statusCode?: number;
  responseBody?: string;
  durationMs?: number;
  error?: string;
}> {
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { success: false, error: "No valid webhook URL provided" };
  }

  // Webhooks are strictly restricted to out_for_delivery and delivered statuses
  if (status !== "out_for_delivery" && status !== "delivered") {
    return {
      success: false,
      error: "Webhooks are only dispatched for out_for_delivery and delivered statuses",
    };
  }

  const payloadObj: WebhookPayload = {
    order_id: options?.orderRef || orderId,
    status: status,
  };
  const jsonPayload = JSON.stringify(payloadObj);
  const startTime = Date.now();

  let secretKey = options?.secretKey || "";
  if (!secretKey && options?.partnerId) {
    try {
      const { data } = await supabase
        .from("partner_api_credentials")
        .select("api_key")
        .eq("partner_id", options.partnerId)
        .maybeSingle();
      if (data?.api_key) {
        secretKey = data.api_key;
      }
    } catch (e) {
      console.warn("[Webhook] Could not fetch partner api_key for signature:", e);
    }
  }

  try {
    const signature = await generateWebhookSignature(jsonPayload, secretKey);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "User-Agent": "9jaVibeMall-Logistics-Webhook/1.0",
    };

    // Non-blocking fetch with 8-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const dispatchPromise = fetch(webhookUrl, {
      method: "POST",
      headers,
      body: jsonPayload,
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        let responseBodyText = "";
        try {
          responseBodyText = await res.text();
        } catch {
          responseBodyText = "";
        }

        const logEntry: WebhookDispatchLog = {
          id: crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random()}`,
          partner_id: options?.partnerId || null,
          order_id: orderId,
          order_ref: options?.orderRef || null,
          webhook_url: webhookUrl,
          event: status,
          request_headers: headers,
          request_payload: payloadObj,
          signature,
          response_status: res.status,
          response_body: responseBodyText,
          duration_ms: durationMs,
          error: res.ok ? null : `HTTP Error ${res.status}: ${res.statusText}`,
          created_at: new Date().toISOString(),
        };

        // Cache locally for instant UI update
        localWebhookLogs.unshift(logEntry);
        if (localWebhookLogs.length > MAX_LOCAL_LOGS) localWebhookLogs.pop();

        // Persist to Supabase webhook_logs table
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
          await supabase.from("webhook_logs").insert({
            partner_id: options?.partnerId || null,
            order_id: isUuid ? orderId : null,
            order_ref: options?.orderRef || orderId,
            webhook_url: webhookUrl,
            event: status,
            request_headers: headers,
            request_payload: payloadObj as any,
            signature,
            response_status: res.status,
            response_body: responseBodyText,
            duration_ms: durationMs,
            error: res.ok ? null : `HTTP Error ${res.status}`,
          });
        } catch (dbErr) {
          console.warn("[Webhook] Could not persist log to database:", dbErr);
        }

        if (!res.ok) {
          console.warn(`[Webhook] Dispatch to ${webhookUrl} returned status ${res.status}`);
        } else {
          console.log(`[Webhook] Successfully dispatched to ${webhookUrl} (status: ${status}, latency: ${durationMs}ms)`);
        }

        return {
          success: res.ok,
          signature,
          statusCode: res.status,
          responseBody: responseBodyText,
          durationMs,
        };
      })
      .catch(async (err) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const errorMessage = err.name === "AbortError" ? "Request Timeout (8000ms)" : (err.message || String(err));

        const logEntry: WebhookDispatchLog = {
          id: crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random()}`,
          partner_id: options?.partnerId || null,
          order_id: orderId,
          order_ref: options?.orderRef || null,
          webhook_url: webhookUrl,
          event: status,
          request_headers: headers,
          request_payload: payloadObj,
          signature,
          response_status: 0,
          response_body: null,
          duration_ms: durationMs,
          error: errorMessage,
          created_at: new Date().toISOString(),
        };

        localWebhookLogs.unshift(logEntry);
        if (localWebhookLogs.length > MAX_LOCAL_LOGS) localWebhookLogs.pop();

        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
          await supabase.from("webhook_logs").insert({
            partner_id: options?.partnerId || null,
            order_id: isUuid ? orderId : null,
            order_ref: options?.orderRef || orderId,
            webhook_url: webhookUrl,
            event: status,
            request_headers: headers,
            request_payload: payloadObj,
            signature,
            response_status: 0,
            response_body: null,
            duration_ms: durationMs,
            error: errorMessage,
          });
        } catch (dbErr) {
          console.warn("[Webhook] Could not persist failed log to database:", dbErr);
        }

        console.warn(`[Webhook] Dispatch error for ${webhookUrl}:`, errorMessage);

        return {
          success: false,
          signature,
          statusCode: 0,
          durationMs,
          error: errorMessage,
        };
      });

    if (options?.throwOnError) {
      return await dispatchPromise;
    }

    return { success: true, signature };
  } catch (err) {
    console.error("[Webhook] Failed to prepare webhook dispatch:", err);
    return { success: false, error: (err as Error).message };
  }
}
