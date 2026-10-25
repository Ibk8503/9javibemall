import { sendWelcomeEmail } from "@/lib/app-emails.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PartnerRole = "owner" | "manager" | "rider";
export type OrderStatus = "pending" | "acknowledged" | "in_transit" | "delivered" | "failed";

export type PartnerContext = {
  userId: string;
  email: string;
  role: PartnerRole;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
};

export const isAdminRole = (role?: PartnerRole) => role === "owner" || role === "manager";

export const canAcknowledgeOrders = (role?: PartnerRole) =>
  role === "owner" || role === "manager" || role === "rider";

export const roleLabel: Record<PartnerRole, string> = {
  owner: "Owner",
  manager: "Manager",
  rider: "Rider",
};

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Awaiting acknowledgement",
  acknowledged: "Acknowledged",
  in_transit: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

export async function loadPartnerContext(): Promise<PartnerContext> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("You are not signed in.");
  const user = userData.user;

  const fullName = (user.user_metadata?.["full_name"] as string | undefined) ?? "";

  // 1. Fetch partner_members for current user
  const { data: initialMember, error: fetchError } = await supabase
    .from("partner_members")
    .select("role, partner_id, partners(name, partner_code)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  let member = initialMember;

  // 2. If no partner member record exists, run bootstrap_partner to initialize workspace
  if (!member) {
    const { error: bootstrapError } = await supabase.rpc("bootstrap_partner", { _name: fullName });
    if (bootstrapError) throw bootstrapError;
    void sendWelcomeEmail().catch(() => {});

    const { data: newMember, error: retryError } = await supabase
      .from("partner_members")
      .select("role, partner_id, partners(name, partner_code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (retryError || !newMember) {
      throw new Error(
        "Failed to initialize workspace for your account. Please try signing in again.",
      );
    }
    member = newMember;
  }

  // 3. Normalize partners object/array from PostgREST response
  const rawPartners = member.partners as
    { name: string; partner_code: string } | { name: string; partner_code: string }[] | null;
  const partnerObj = Array.isArray(rawPartners) ? rawPartners[0] : rawPartners;

  let partnerName = partnerObj?.name;
  let partnerCode = partnerObj?.partner_code;

  // 4. Fallback: If PostgREST didn't join partners, fetch partner directly by partner_id
  if (!partnerName || !partnerCode) {
    const { data: directPartner } = await supabase
      .from("partners")
      .select("name, partner_code")
      .eq("id", member.partner_id)
      .maybeSingle();

    if (directPartner) {
      partnerName = directPartner.name;
      partnerCode = directPartner.partner_code;
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: member.role as PartnerRole,
    partnerId: member.partner_id,
    partnerName: partnerName ?? "Smart Logistics Partner",
    partnerCode: partnerCode ?? "SL-MAIN",
  };
}

export function usePartnerContext() {
  return useQuery({
    queryKey: ["partner-context"],
    queryFn: loadPartnerContext,
    staleTime: 60_000,
  });
}

export const shortTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
    : "—";
