import { sendDeliveryAssignedEmail } from "@/lib/app-emails.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Truck, PackageCheck, XCircle, UserCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, shortTime, type OrderStatus } from "@/lib/partner";
import { dispatchOrderWebhook } from "@/lib/order-webhooks.functions";
import { emailManagersDeliveryUpdate } from "@/lib/delivery-support.functions";
import { useTeam, memberName } from "@/lib/support";
import { isAdminRole } from "@/lib/partner";
import { LiveRidersPanel } from "@/components/LiveRidersPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/deliveries")({
  head: () => ({
    meta: [{ title: "Active Deliveries Dispatch · 9jaVibeMall Logistics" }],
  }),
  component: Deliveries,
});

function Deliveries() {
  const { data: ctx } = usePartnerContext();
  const queryClient = useQueryClient();
  const sendWebhook = useServerFn(dispatchOrderWebhook);
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const emailManagers = useServerFn(emailManagersDeliveryUpdate);
  const isAdmin = isAdminRole(ctx?.role);
  const { data: team } = useTeam(ctx?.partnerId);
  const riders = (team ?? []).filter((m) => m.role === "rider");
  const [assignTarget, setAssignTarget] = useState<{ id: string; ref: string } | null>(null);
  const [pickedRider, setPickedRider] = useState("");

  async function assignRider(orderId: string, riderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ assigned_rider_id: riderId, assigned_rider: riderId })
      .eq("id", orderId);
    if (error) throw error;
    const name = memberName(team?.find((m) => m.user_id === riderId));
    await supabase
      .from("delivery_events")
      .insert({ order_id: orderId, status: "acknowledged", note: `Assigned to ${name}`, actor_id: ctx!.userId });
    void sendDeliveryAssignedEmail({ data: { orderId } }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  }

  const confirmAssign = useMutation({
    mutationFn: async () => {
      if (!assignTarget || !pickedRider) throw new Error("Pick a rider first");
      await assignRider(assignTarget.id, pickedRider);
    },
    onSuccess: () => {
      toast.success("Delivery assigned");
      setAssignTarget(null);
      setPickedRider("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const {
    data: orders,
    isPending,
    error,
  } = useQuery({
    queryKey: ["orders", "active", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at",
        )
        .eq("partner_id", ctx!.partnerId)
        .in("status", ["acknowledged", "in_transit"])
        .order("acknowledged_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const advance = useMutation({
    mutationFn: async ({
      id,
      status,
      note,
      order_ref,
    }: {
      id: string;
      status: OrderStatus;
      note: string;
      order_ref?: string | null;
    }) => {
      const patch: { status: OrderStatus; delivered_at?: string } = { status };
      if (status === "delivered") patch.delivered_at = new Date().toISOString();

      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;

      await supabase
        .from("delivery_events")
        .insert({ order_id: id, status, note, actor_id: ctx!.userId });

      void emailManagers({ data: { orderId: id, note } }).catch(() => undefined);

      if (status === "in_transit" || status === "delivered") {
        const webhookResult = await sendWebhook({
          data: {
            orderId: id,
            status: status === "in_transit" ? "out_for_delivery" : "delivered",
            orderRef: order_ref ?? null,
          },
        });
        if (!webhookResult.success && webhookResult.error) {
          toast.warning(`Status saved, but webhook delivery failed: ${webhookResult.error}`);
        }
      }

    },
    onSuccess: () => {
      toast.success("Delivery status updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const claim = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_rider: ctx!.userId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Delivery assigned to your account!");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <Truck className="size-7 text-[#F2751A]" />
            Dispatch & Active Deliveries
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Parcels currently moving through{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span> fleet.
          </p>
        </div>
        <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-3 py-1 text-xs font-extrabold text-purple-500">
          {orders?.length ?? 0} In Progress
        </span>
      </div>

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
        </div>
      ) : error ? (
        <div className="saas-card p-4 text-xs text-red-500 border-red-500/30">
          Error loading active deliveries: {(error as Error).message}
        </div>
      ) : !orders?.length ? (
        <EmptyState
          icon={Truck}
          title="No active deliveries right now"
          description="Acknowledge an incoming order from your API drops to begin a dispatch delivery job."
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
                    · Acknowledged {shortTime(order.acknowledged_at)}
                  </span>
                </div>
                <StatusPill status={order.status} />
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

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin && (
                    <Button
                      size="sm"
                      className="h-9 text-xs font-bold"
                      onClick={() => {
                        setAssignTarget({ id: order.id, ref: order.order_ref });
                        setPickedRider(order.assigned_rider_id ?? "");
                      }}
                    >
                      <UserCheck className="mr-1.5 size-3.5" />
                      {order.assigned_rider_id ? "Reassign" : "Assign Delivery"}
                    </Button>
                  )}
                  {order.assigned_rider ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      <UserCheck className="size-3.5" />{" "}
                      {memberName(team?.find((m) => m.user_id === (order.assigned_rider_id ?? order.assigned_rider)))}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs font-bold border-border bg-card text-foreground hover:bg-muted"
                      onClick={() => claim.mutate(order.id)}
                      disabled={claim.isPending}
                    >
                      <UserCheck className="mr-1.5 size-3.5 text-[#F2751A]" /> Assign to Me
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {order.status === "acknowledged" && (
                    <Button
                      size="sm"
                      className="neon-brand-btn h-10 px-5 font-extrabold text-xs rounded-xl"
                      onClick={() =>
                        advance.mutate({
                          id: order.id,
                          status: "in_transit",
                          note: "Parcel picked up, out for delivery",
                          order_ref: order.order_ref,
                        })
                      }
                      disabled={advance.isPending}
                    >
                      <Truck className="mr-1.5 size-4" /> Dispatch / Out for Delivery
                    </Button>
                  )}

                  {order.status === "in_transit" && (
                    <Button
                      size="sm"
                      className="h-10 px-5 font-extrabold text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                      onClick={() =>
                        advance.mutate({
                          id: order.id,
                          status: "delivered",
                          note: "Parcel successfully delivered to recipient",
                          order_ref: order.order_ref,
                        })
                      }
                      disabled={advance.isPending}
                    >
                      <PackageCheck className="mr-1.5 size-4" /> Mark Delivered
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-10 px-4 font-bold text-xs rounded-xl"
                    onClick={() => setFailTargetId(order.id)}
                    disabled={advance.isPending}
                  >
                    <XCircle className="mr-1.5 size-4" /> Mark Failed
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {isAdmin && ctx && (
        <LiveRidersPanel partnerId={ctx.partnerId} riders={riders} orders={orders ?? []} onAssign={assignRider} />
      )}

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Assign {assignTarget?.ref}</DialogTitle>
            <DialogDescription>Pick the rider who will handle this delivery, then confirm.</DialogDescription>
          </DialogHeader>
          {riders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No riders on your team yet. Invite one from the Team page.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {riders.map((r) => {
                const load = (orders ?? []).filter((o) => o.assigned_rider_id === r.user_id).length;
                return (
                  <label
                    key={r.user_id}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm ${pickedRider === r.user_id ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="rider"
                        checked={pickedRider === r.user_id}
                        onChange={() => setPickedRider(r.user_id)}
                      />
                      <span className="font-bold">{memberName(r)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{load} active</span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button disabled={!pickedRider || confirmAssign.isPending} onClick={() => confirmAssign.mutate()}>
              {confirmAssign.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!failTargetId} onOpenChange={(open) => !open && setFailTargetId(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500 font-display">
              <AlertTriangle className="size-5" /> Confirm Delivery Failure
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Are you sure you want to mark this delivery attempt as failed? This will record a
              failure event in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 font-bold"
              onClick={() => {
                if (failTargetId) {
                  const targetOrder = orders?.find((o) => o.id === failTargetId);
                  advance.mutate({
                    id: failTargetId,
                    status: "failed",
                    note: "Delivery attempt failed (recipient unavailable/rejected)",
                    order_ref: targetOrder?.order_ref ?? null,
                  });
                  setFailTargetId(null);
                }
              }}
            >
              Confirm Failure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
