import { sendDeliveryAssignedEmail } from "@/lib/app-emails.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, MapPin, Truck, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, isAdminRole, shortTime, type OrderStatus } from "@/lib/partner";
import { useTeam, memberName } from "@/lib/support";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { LiveRidersPanel } from "@/components/LiveRidersPanel";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/tracking")({
  head: () => ({
    meta: [
      { title: "Delivery Tracking · 9jaVibeMall Logistics" },
      { name: "description", content: "Live view of assigned deliveries, rider locations and completed deliveries." },
    ],
  }),
  component: Tracking,
});

function Tracking() {
  const { data: ctx } = usePartnerContext();
  const qc = useQueryClient();
  const { data: team } = useTeam(ctx?.partnerId);
  const riders = (team ?? []).filter((m) => m.role === "rider");
  const [tab, setTab] = useState<"active" | "done">("active");

  const { data: orders, isPending } = useQuery({
    queryKey: ["orders", "tracking", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_ref, dropoff_address, status, assigned_rider_id, acknowledged_at, delivered_at, updated_at")
        .eq("partner_id", ctx!.partnerId)
        .in("status", ["acknowledged", "in_transit", "delivered", "failed"])
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Live refresh when any order for this partner changes.
  useEffect(() => {
    if (!ctx) return;
    const ch = supabase
      .channel(`tracking-${ctx.partnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `partner_id=eq.${ctx.partnerId}` }, () =>
        qc.invalidateQueries({ queryKey: ["orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ctx, qc]);

  const all = orders ?? [];
  const active = useMemo(() => all.filter((o) => o.assigned_rider_id && (o.status === "acknowledged" || o.status === "in_transit")), [all]);
  const done = useMemo(() => all.filter((o) => o.status === "delivered" || o.status === "failed"), [all]);
  const today = new Date().toDateString();
  const doneToday = done.filter((o) => o.delivered_at && new Date(o.delivered_at).toDateString() === today).length;

  async function assignRider(orderId: string, riderId: string) {
    const { error } = await supabase.from("orders").update({ assigned_rider_id: riderId, assigned_rider: riderId }).eq("id", orderId);
    if (error) throw error;
    const name = memberName(team?.find((m) => m.user_id === riderId));
    await supabase.from("delivery_events").insert({ order_id: orderId, status: "acknowledged", note: `Assigned to ${name}`, actor_id: ctx!.userId });
    void sendDeliveryAssignedEmail({ data: { orderId } }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  if (ctx && !isAdminRole(ctx.role)) {
    return <EmptyState icon={Truck} title="Managers only" description="This tracking view is for owners and managers." />;
  }

  const riderName = (id: string | null) => (id ? memberName(team?.find((m) => m.user_id === id)) : "Unassigned");
  const list = tab === "active" ? active : done;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Delivery Tracking</h1>
        <p className="text-sm text-muted-foreground">Every assigned delivery, where your riders are, and what's been completed — updates live.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Truck} label="Out now" value={active.length} />
        <Stat icon={Clock} label="Out for delivery" value={active.filter((o) => o.status === "in_transit").length} />
        <Stat icon={CheckCircle2} label="Delivered today" value={doneToday} />
        <Stat icon={Users} label="Riders" value={riders.length} />
      </div>

      {ctx && <LiveRidersPanel partnerId={ctx.partnerId} riders={riders} orders={all} onAssign={assignRider} />}

      <section className="rounded-xl border border-border bg-card">
        <div className="flex gap-2 border-b border-border p-3">
          {(["active", "done"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t === "active" ? `Assigned (${active.length})` : `Completed (${done.length})`}
            </button>
          ))}
        </div>
        {isPending ? (
          <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{tab === "active" ? "No deliveries out right now." : "No completed deliveries yet."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{o.order_ref}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3" />{o.dropoff_address}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{riderName(o.assigned_rider_id)}</p>
                  <p>{shortTime(o.delivered_at ?? o.updated_at)}</p>
                </div>
                <StatusPill status={o.status as OrderStatus} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
