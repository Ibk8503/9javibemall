import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, isAdminRole, shortTime } from "@/lib/partner";
import { useTeam, memberName } from "@/lib/support";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/availability")({
  head: () => ({
    meta: [
      { title: "Rider Availability · 9jaVibeMall Logistics" },
      { name: "description", content: "Mark riders as available or busy before assigning deliveries." },
      { property: "og:title", content: "Rider Availability · 9jaVibeMall Logistics" },
      { property: "og:description", content: "Mark riders as available or busy before assigning deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Availability,
});

type Status = "available" | "busy";

export function useRiderAvailability(partnerId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase
      .channel(`availability-${partnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_availability", filter: `partner_id=eq.${partnerId}` }, () =>
        qc.invalidateQueries({ queryKey: ["rider-availability", partnerId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [partnerId, qc]);
  return useQuery({
    queryKey: ["rider-availability", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_availability")
        .select("user_id, status, updated_at")
        .eq("partner_id", partnerId!);
      if (error) throw error;
      return data;
    },
  });
}

function Availability() {
  const { data: ctx } = usePartnerContext();
  const qc = useQueryClient();
  const { data: team } = useTeam(ctx?.partnerId);
  const riders = (team ?? []).filter((m) => m.role === "rider");
  const { data: avail } = useRiderAvailability(ctx?.partnerId);

  const setStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: Status }) => {
      const { error } = await supabase.from("rider_availability").upsert(
        { partner_id: ctx!.partnerId, user_id: userId, status, updated_by: ctx!.userId, updated_at: new Date().toISOString() },
        { onConflict: "partner_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rider-availability", ctx?.partnerId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (ctx && !isAdminRole(ctx.role)) {
    return <EmptyState icon={UserCheck} title="Managers only" description="Only owners and managers can set rider availability." />;
  }

  const statusOf = (id: string): Status => (avail?.find((a) => a.user_id === id)?.status as Status) ?? "available";
  const availableCount = riders.filter((r) => statusOf(r.user_id) === "available").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Rider Availability</h1>
        <p className="text-sm text-muted-foreground">
          Mark riders available or busy. {availableCount} of {riders.length} available now.
        </p>
      </div>
      {riders.length === 0 ? (
        <EmptyState icon={UserCheck} title="No riders yet" description="Invite riders from the Team page." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {riders.map((r) => {
            const s = statusOf(r.user_id);
            const row = avail?.find((a) => a.user_id === r.user_id);
            return (
              <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-semibold text-foreground">
                    <span className={`mr-2 inline-block size-2 rounded-full ${s === "available" ? "bg-primary" : "bg-destructive"}`} />
                    {memberName(r)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s === "available" ? "Available" : "Busy"}
                    {row ? ` · updated ${shortTime(row.updated_at)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {(["available", "busy"] as const).map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={s === opt ? "default" : "outline"}
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ userId: r.user_id, status: opt })}
                    >
                      {opt === "available" ? "Available" : "Busy"}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
