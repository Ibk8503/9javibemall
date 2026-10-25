import { supabase } from "@/integrations/supabase/client";

export interface AuthenticatedPartner {
  partnerId: string;
  error?: string;
}

/**
 * Authenticates an incoming HTTP request using x-api-key header.
 * Derives partner_id securely from database partner_api_credentials.
 */
export async function authenticatePartnerKey(request: Request): Promise<AuthenticatedPartner> {
  const apiKey =
    request.headers.get("x-api-key") ||
    request.headers.get("x-partner-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return { partnerId: "", error: "Missing x-api-key header" };
  }

  const cleanKey = apiKey.trim();

  // 1. First attempt to call the RPC function (bypasses RLS safely for unauthenticated API requests)
  try {
    const { data: rpcPartnerId, error: rpcError } = await (supabase.rpc as any)(
      "verify_partner_api_key",
      { _key: cleanKey },
    );

    if (!rpcError && typeof rpcPartnerId === "string" && rpcPartnerId) {
      return { partnerId: rpcPartnerId };
    }
  } catch (err) {
    console.warn("RPC verify_partner_api_key error, falling back to direct table query:", err);
  }

  // 2. Fallback to direct query (for authenticated admin sessions or service role)
  const { data, error } = await supabase
    .from("partner_api_credentials")
    .select("partner_id")
    .eq("api_key", cleanKey)
    .maybeSingle();

  if (error || !data) {
    return { partnerId: "", error: "Invalid or inactive API key" };
  }

  return { partnerId: data.partner_id };
}
