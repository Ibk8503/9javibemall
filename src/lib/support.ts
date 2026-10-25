import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** True when the signed-in user is 9jaVibeMall platform support. */
export function useIsSupport() {
  return useQuery({
    queryKey: ["is-support"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("is_platform_support", { _user_id: u.user.id });
      return !!data;
    },
  });
}

export interface TeamMember {
  user_id: string;
  role: "owner" | "manager" | "rider";
  email: string | null;
  full_name: string | null;
}

export function useTeam(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["team-roster", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("partner_team", { _partner_id: partnerId! });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

export const memberName = (m?: Pick<TeamMember, "full_name" | "email"> | null) =>
  m?.full_name || m?.email || "Unnamed";
