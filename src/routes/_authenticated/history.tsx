import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History, Search, Inbox, CheckCircle2, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, shortTime, statusLabel, type OrderStatus } from "@/lib/partner";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [{ title: "Delivery Audit History · 9jaVibeMall Logistics" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data: ctx } = usePartnerContext();
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["orders", "history", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, acknowledged_at, delivered_at, created_at, updated_at, delivery_events(id, status, note, created_at, actor_id)",
        )
        .eq("partner_id", ctx!.partnerId)
        .in("status", ["delivered", "failed"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return orders;
    },
  });

  const filteredOrders = (data ?? []).filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.order_ref.toLowerCase().includes(term) ||
      (o.pickup_address && o.pickup_address.toLowerCase().includes(term)) ||
      (o.pickup_contact_name && o.pickup_contact_name.toLowerCase().includes(term)) ||
      (o.dropoff_address && o.dropoff_address.toLowerCase().includes(term)) ||
      (o.dropoff_contact_name && o.dropoff_contact_name.toLowerCase().includes(term))
    );
  });

  const delivered = data?.filter((o) => o.status === "delivered").length ?? 0;
  const failed = data?.filter((o) => o.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <History className="size-7 text-[#F2751A]" />
            Closed Delivery Audit Log
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Complete closed delivery event trail for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="saas-card border-emerald-500/30 bg-emerald-500/5 p-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Delivered Orders
            </span>
            <p className="font-display mt-2 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {delivered}
            </p>
          </div>
          <CheckCircle2 className="size-8 text-emerald-500" />
        </div>

        <div className="saas-card border-red-500/30 bg-red-500/5 p-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              Failed Attempts
            </span>
            <p className="font-display mt-2 text-3xl font-extrabold text-red-600 dark:text-red-400">
              {failed}
            </p>
          </div>
          <XCircle className="size-8 text-red-500" />
        </div>
      </div>

      {/* Search Input Filter */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter history by Order Ref (e.g. 9VM-10241), customer name, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11 text-xs bg-card border-border text-foreground rounded-xl focus:border-primary"
        />
      </div>

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-44 w-full rounded-2xl bg-muted" />
        </div>
      ) : error ? (
        <div className="saas-card p-4 text-xs text-red-500 border-red-500/30">
          Error loading history records: {(error as Error).message}
        </div>
      ) : !filteredOrders.length ? (
        <EmptyState
          icon={Inbox}
          title="No closed delivery records"
          description={
            searchTerm
              ? `No closed deliveries matching "${searchTerm}".`
              : "Completed and failed delivery jobs will appear here in the audit log."
          }
        />
      ) : (
        <div className="grid gap-5">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="saas-card p-6 border-border hover:border-muted-foreground/30 transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="font-display text-xl font-extrabold text-foreground">
                    {order.order_ref}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground font-medium">
                    · Closed {shortTime(order.delivered_at ?? order.updated_at)}
                  </span>
                </div>
                <StatusPill status={order.status} />
              </div>

              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-bold text-[#F2751A]">Pickup:</span>{" "}
                  <span className="font-medium text-foreground">{order.pickup_address}</span>
                  {order.pickup_contact_name
                    ? ` (Contact: ${order.pickup_contact_name}${order.pickup_contact_phone ? ` - ${order.pickup_contact_phone}` : ""})`
                    : ""}
                </p>
                <p>
                  <span className="font-bold text-emerald-500">Dropoff:</span>{" "}
                  <span className="font-medium text-foreground">{order.dropoff_address}</span>
                  {order.dropoff_contact_name
                    ? ` (Contact: ${order.dropoff_contact_name}${order.dropoff_contact_phone ? ` - ${order.dropoff_contact_phone}` : ""})`
                    : ""}
                </p>
                {order.items ? (
                  <p className="font-medium text-foreground">
                    Items: <span className="text-muted-foreground">{order.items}</span>
                  </p>
                ) : null}
              </div>

              {/* Timeline Audit Events */}
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Audit Event Log
                </p>
                <ol className="relative ml-2 space-y-3 border-l border-border pl-4">
                  {[...(order.delivery_events ?? [])]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((event) => (
                      <li key={event.id} className="text-xs">
                        <div className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-card bg-[#F2751A]" />
                        <span className="font-bold text-foreground uppercase tracking-wide">
                          {statusLabel[event.status as OrderStatus] || event.status}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {" "}
                          · {shortTime(event.created_at)}
                        </span>
                        {event.note ? (
                          <p className="mt-1 text-muted-foreground italic">{event.note}</p>
                        ) : null}
                      </li>
                    ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
