import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CheckCircle2, Loader2, Inbox, PackageSearch } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, shortTime, canAcknowledgeOrders, isAdminRole } from "@/lib/partner";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/incoming")({
  head: () => ({
    meta: [{ title: "Incoming Orders Feed · 9jaVibeMall Logistics" }],
  }),
  component: Incoming,
});

function Incoming() {
  const { data: ctx } = usePartnerContext();
  const queryClient = useQueryClient();

  const {
    data: orders,
    isPending,
    error,
  } = useQuery({
    queryKey: ["orders", "pending", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at",
        )
        .eq("partner_id", ctx!.partnerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Notify a rider the instant a new order is assigned to them
  useEffect(() => {
    if (!ctx?.userId) return;
    const channel = supabase
      .channel("rider-assigned-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `assigned_rider_id=eq.${ctx.userId}` },
        () => {
          toast.info("New order assigned to you — check Incoming");
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ctx?.userId, queryClient]);

  // Notify managers/owners when an order escalates (no rider response within the window)
  useEffect(() => {
    if (!ctx || !isAdminRole(ctx.role)) return;
    const channel = supabase
      .channel("escalated-orders")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `partner_id=eq.${ctx.partnerId}` },
        (payload) => {
          if (payload.new["escalated"] && !payload.old["escalated"]) {
            toast.warning(`Order ${payload.new["order_ref"]} needs attention — no rider response`);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ctx]);

  const acknowledge = useMutation({
    mutationFn: async (order: { id: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;

      await supabase.from("delivery_events").insert({
        order_id: order.id,
        status: "acknowledged",
        note: "Order acknowledged by partner fleet",
        actor_id: ctx!.userId,
      });
    },
    onSuccess: () => {
      toast.success("Order acknowledged & moved to dispatch feed!");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <PackageSearch className="size-7 text-[#F2751A]" />
            Incoming API Drops
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Live order drops for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span>. Acknowledge to
            accept job.
          </p>
        </div>
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-extrabold text-amber-500">
          {orders?.length ?? 0} Pending
        </span>
      </div>

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
        </div>
      ) : error ? (
        <div className="saas-card p-4 text-xs text-red-500 border-red-500/30">
          Error loading incoming orders: {(error as Error).message}
        </div>
      ) : !orders?.length ? (
        <EmptyState
          icon={Inbox}
          title="No incoming orders right now"
          description="Only real orders created via POST /api/public/orders using your API key will drop here."
        />
      ) : (
        <div className="grid gap-5">
          {orders.map((order) => (
            <article
              key={order.id}
              className="saas-card p-6 border-border hover:border-[#F2751A]/50 transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl font-extrabold text-foreground">
                    {order.order_ref}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    · Received {shortTime(order.created_at)}
                  </span>
                </div>
                <StatusPill status="pending" />
              </div>

              <dl className="mt-5 grid gap-4 text-xs sm:text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-[#F2751A]">
                    Pickup Details
                  </dt>
                  <dd className="mt-1 font-bold text-foreground">
                    {order.pickup_address}
                    {order.pickup_contact_name || order.pickup_contact_phone ? (
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        Contact: {order.pickup_contact_name ?? "N/A"}{" "}
                        {order.pickup_contact_phone ? `(${order.pickup_contact_phone})` : ""}
                      </span>
                    ) : null}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                    Dropoff Details
                  </dt>
                  <dd className="mt-1 font-bold text-foreground">
                    {order.dropoff_address}
                    {order.dropoff_contact_name || order.dropoff_contact_phone ? (
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        Contact: {order.dropoff_contact_name ?? "N/A"}{" "}
                        {order.dropoff_contact_phone ? `(${order.dropoff_contact_phone})` : ""}
                      </span>
                    ) : null}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Items Package
                  </dt>
                  <dd className="mt-1 font-bold text-foreground">
                    {order.items ?? "Standard Parcel"}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                {canAcknowledgeOrders(ctx?.role) ? (
                  <Button
                    className="neon-brand-btn h-11 px-6 font-extrabold text-xs rounded-xl"
                    onClick={() => acknowledge.mutate(order)}
                    disabled={acknowledge.isPending}
                  >
                    {acknowledge.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 size-4" />
                    )}
                    Acknowledge & Accept Job
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Your role ({ctx?.role}) does not have permission to acknowledge orders.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}