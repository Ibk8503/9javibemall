import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Navigation, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, isAdminRole, shortTime, statusLabel, type OrderStatus } from "@/lib/partner";
import { dispatchOrderWebhook } from "@/lib/order-webhooks.functions";
import { emailManagersDeliveryUpdate } from "@/lib/delivery-support.functions";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/my-deliveries")({
  head: () => ({
    meta: [
      { title: "My Deliveries · 9jaVibeMall Logistics" },
      { name: "description", content: "Your assigned deliveries with live status, time and location updates." },
    ],
  }),
  component: MyDeliveries,
});

type Scope = "mine" | "team";

function MyDeliveries() {
  const { data: ctx } = usePartnerContext();
  const qc = useQueryClient();
  const sendWebhook = useServerFn(dispatchOrderWebhook);
  const emailManagers = useServerFn(emailManagersDeliveryUpdate);
  const [sharing, setSharing] = useState<"off" | "on" | "denied">("off");
  const lastSent = useRef(0);
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const isAdmin = isAdminRole(ctx?.role);
  const [scope, setScope] = useState<Scope>("mine");
  const [locDraft, setLocDraft] = useState<Record<string, string>>({});

  const { data, isPending, error } = useQuery({
    queryKey: ["orders", "assigned", ctx?.partnerId, ctx?.userId, scope],
    enabled: !!ctx,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_ref, pickup_address, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider_id, acknowledged_at, delivered_at, updated_at, delivery_events(id, status, note, location, latitude, longitude, created_at)",
        )
        .eq("partner_id", ctx!.partnerId)
        .in("status", ["acknowledged", "in_transit", "delivered", "failed"])
        .order("updated_at", { ascending: false })
        .limit(50);
      q = scope === "mine" ? q.eq("assigned_rider_id", ctx!.userId) : q.not("assigned_rider_id", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const postEvent = useMutation({
    mutationFn: async (v: {
      id: string;
      status: OrderStatus;
      note: string;
      orderRef: string;
      changeStatus: boolean;
      location?: string | null;
      lat?: number | null;
      lng?: number | null;
    }) => {
      if (v.changeStatus) {
        const patch: { status: OrderStatus; delivered_at?: string } = { status: v.status };
        if (v.status === "delivered") patch.delivered_at = new Date().toISOString();
        const { error } = await supabase.from("orders").update(patch).eq("id", v.id);
        if (error) throw error;
      }
      const { error: evErr } = await supabase.from("delivery_events").insert({
        order_id: v.id,
        status: v.status,
        note: v.note,
        actor_id: ctx!.userId,
        location: v.location ?? null,
        latitude: v.lat ?? null,
        longitude: v.lng ?? null,
      });
      if (evErr) throw evErr;
      if (v.changeStatus) void emailManagers({ data: { orderId: v.id, note: v.note } }).catch(() => undefined);
      if (v.changeStatus && (v.status === "in_transit" || v.status === "delivered")) {
        const r = await sendWebhook({
          data: { orderId: v.id, status: v.status === "in_transit" ? "out_for_delivery" : "delivered", orderRef: v.orderRef },
        });
        if (!r.success && r.error) toast.warning(`Saved, but partner notification failed: ${r.error}`);
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.changeStatus ? "Status updated" : "Location update posted");
      setLocDraft((d) => ({ ...d, [v.id]: "" }));
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function shareLocation(o: { id: string; status: OrderStatus; order_ref: string }) {
    const typed = (locDraft[o.id] ?? "").trim();
    const send = (lat: number | null, lng: number | null) =>
      postEvent.mutate({
        id: o.id,
        status: o.status,
        orderRef: o.order_ref,
        changeStatus: false,
        note: typed ? `Location update: ${typed}` : "Location update",
        location: typed || (lat !== null ? `${lat.toFixed(5)}, ${lng!.toFixed(5)}` : null),
        lat,
        lng,
      });
    if (!typed && lastCoords.current) {
      send(lastCoords.current.lat, lastCoords.current.lng);
    } else if (!typed && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => send(p.coords.latitude, p.coords.longitude),
        () => toast.error("Couldn't get your location. Type where you are instead."),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30_000 },
      );
    } else if (typed) {
      send(null, null);
    } else {
      toast.error("Type where you are to post an update.");
    }
  }

  const active = (data ?? []).filter((o) => o.status === "acknowledged" || o.status === "in_transit");
  const done = (data ?? []).filter((o) => o.status === "delivered" || o.status === "failed");

  // Automatic live location while I have an active delivery assigned to me.
  const myActive = active.find((o) => o.assigned_rider_id === ctx?.userId);
  const myActiveId = myActive?.id ?? null;
  useEffect(() => {
    if (!ctx || !myActiveId || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setSharing("off");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      async (p) => {
        setSharing("on");
        lastCoords.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (Date.now() - lastSent.current < 30_000) return;
        lastSent.current = Date.now();
        await supabase.from("rider_locations").upsert({
          user_id: ctx.userId,
          partner_id: ctx.partnerId,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          order_id: myActiveId,
          updated_at: new Date().toISOString(),
        });
      },
      () => setSharing("denied"),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [ctx, myActiveId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <Navigation className="size-7 text-primary" /> My Deliveries
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deliveries assigned to {scope === "mine" ? "you" : "your riders"}, with status, time and location updates.
          </p>
        </div>
        {myActiveId && (
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${sharing === "on" ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground"}`}>
            {sharing === "on" ? "● Live location on" : sharing === "denied" ? "Location blocked — allow it in your browser" : "Starting live location…"}
          </span>
        )}
        {isAdmin && (
          <div className="flex gap-1 rounded-full border border-border p-1">
            {(["mine", "team"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s === "mine" ? "Assigned to me" : "All riders"}
              </button>
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-44 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : !data?.length ? (
        <EmptyState icon={Truck} title="No assigned deliveries" description="Deliveries assigned to you will appear here." />
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active ({active.length})</h2>
            {active.map((o) => (
              <DeliveryCard key={o.id} order={o}>
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Input
                    className="min-w-48 flex-1"
                    placeholder="Where are you? (leave blank to use GPS)"
                    value={locDraft[o.id] ?? ""}
                    onChange={(e) => setLocDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                  />
                  <Button variant="outline" disabled={postEvent.isPending} onClick={() => shareLocation(o)}>
                    <Crosshair className="mr-2 size-4" /> Post location
                  </Button>
                  {o.status === "acknowledged" && (
                    <Button
                      disabled={postEvent.isPending}
                      onClick={() => postEvent.mutate({ id: o.id, status: "in_transit", orderRef: o.order_ref, changeStatus: true, note: "Parcel picked up, out for delivery" })}
                    >
                      <Truck className="mr-2 size-4" /> Picked up
                    </Button>
                  )}
                  {o.status === "in_transit" && (
                    <Button
                      disabled={postEvent.isPending}
                      onClick={() => postEvent.mutate({ id: o.id, status: "delivered", orderRef: o.order_ref, changeStatus: true, note: "Parcel delivered to recipient" })}
                    >
                      <PackageCheck className="mr-2 size-4" /> Delivered
                    </Button>
                  )}
                </div>
              </DeliveryCard>
            ))}
          </section>
          {done.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Completed ({done.length})</h2>
              {done.map((o) => <DeliveryCard key={o.id} order={o} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface CardOrder {
  order_ref: string;
  status: OrderStatus;
  pickup_address: string;
  dropoff_address: string;
  dropoff_contact_name: string | null;
  dropoff_contact_phone: string | null;
  items: string | null;
  updated_at: string;
  delivery_events: {
    id: string;
    status: OrderStatus;
    note: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
  }[];
}

function DeliveryCard({ order, children }: { order: CardOrder; children?: React.ReactNode }) {
  const events = [...order.delivery_events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lastLoc = events.find((e) => e.location);
  return (
    <article className="saas-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-lg font-extrabold text-foreground">{order.order_ref}</p>
          <p className="text-xs text-muted-foreground">Updated {shortTime(order.updated_at)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-[11px] font-bold uppercase text-primary">Pickup</dt><dd className="text-foreground">{order.pickup_address}</dd></div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-emerald-500">Drop-off</dt>
          <dd className="text-foreground">{order.dropoff_address}</dd>
          {order.dropoff_contact_phone && (
            <a className="text-xs text-primary underline" href={`tel:${order.dropoff_contact_phone}`}>
              {order.dropoff_contact_name ?? "Call"} · {order.dropoff_contact_phone}
            </a>
          )}
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-muted-foreground">Last location</dt>
          <dd className="text-foreground">
            {lastLoc ? (
              <>
                {lastLoc.latitude !== null && lastLoc.longitude !== null ? (
                  <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lastLoc.latitude},${lastLoc.longitude}`}>{lastLoc.location}</a>
                ) : lastLoc.location}
                <span className="block text-xs text-muted-foreground">{shortTime(lastLoc.created_at)}</span>
              </>
            ) : "No updates yet"}
          </dd>
        </div>
      </dl>
      <ol className="space-y-2 border-l border-border pl-4">
        {events.slice(0, 6).map((e) => (
          <li key={e.id} className="text-xs">
            <span className="font-bold text-foreground">{statusLabel[e.status] ?? e.status}</span>
            <span className="text-muted-foreground"> · {shortTime(e.created_at)}</span>
            {e.note && <p className="text-muted-foreground">{e.note}</p>}
            {e.location && <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" />{e.location}</p>}
          </li>
        ))}
      </ol>
      {children}
    </article>
  );
}
