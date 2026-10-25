import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bike, Star } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, shortTime } from "@/lib/partner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRiderAvailability } from "./availability";

export const Route = createFileRoute("/_authenticated/rider")({
  head: () => ({
    meta: [
      { title: "Rider App · 9jaVibeMall Logistics" },
      { name: "description", content: "Riders view assigned deliveries, set availability and rate completed deliveries." },
      { property: "og:title", content: "Rider App · 9jaVibeMall Logistics" },
      { property: "og:description", content: "Riders view assigned deliveries, set availability and rate completed deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiderApp,
});

const STATUS_LABEL: Record<string, string> = {
  acknowledged: "Ready for pickup",
  in_transit: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

function RiderApp() {
  const { data: ctx } = usePartnerContext();
  const qc = useQueryClient();
  const partnerId = ctx?.partnerId;
  const userId = ctx?.userId;
  const { data: avail } = useRiderAvailability(partnerId);
  const myStatus = (avail?.find((a) => a.user_id === userId)?.status as "available" | "busy") ?? "available";

  const orders = useQuery({
    queryKey: ["rider-app-orders", partnerId, userId],
    enabled: !!partnerId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_ref, dropoff_address, status, updated_at")
        .eq("partner_id", partnerId!)
        .eq("assigned_rider_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ratings = useQuery({
    queryKey: ["rider-ratings", partnerId, userId],
    enabled: !!partnerId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_ratings")
        .select("order_id, rating, comment")
        .eq("rider_id", userId!);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!partnerId || !userId) return;
    const ch = supabase
      .channel(`rider-app-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `assigned_rider_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ["rider-app-orders", partnerId, userId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [partnerId, userId, qc]);

  const setAvail = useMutation({
    mutationFn: async (status: "available" | "busy") => {
      const { error } = await supabase.from("rider_availability").upsert(
        { partner_id: partnerId!, user_id: userId!, status, updated_by: userId!, updated_at: new Date().toISOString() },
        { onConflict: "partner_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, s) => {
      toast.success(s === "available" ? "You're available" : "You're marked busy");
      qc.invalidateQueries({ queryKey: ["rider-availability", partnerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ctx && ctx.role !== "rider") {
    return <EmptyState icon={Bike} title="Riders only" description="This page is for riders. Managers can use Tracking and Availability." />;
  }

  const list = orders.data ?? [];
  const active = list.filter((o) => o.status === "acknowledged" || o.status === "in_transit");
  const done = list.filter((o) => o.status === "delivered" || o.status === "failed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Rider App</h1>
        <p className="text-sm text-muted-foreground">Your deliveries, availability and ratings.</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          <span className={`mr-2 inline-block size-2 rounded-full ${myStatus === "available" ? "bg-primary" : "bg-destructive"}`} />
          You are {myStatus === "available" ? "Available" : "Busy"}
        </p>
        <div className="mt-3 flex gap-2">
          {(["available", "busy"] as const).map((opt) => (
            <Button key={opt} className="flex-1" variant={myStatus === opt ? "default" : "outline"} disabled={setAvail.isPending}
              onClick={() => setAvail.mutate(opt)}>
              {opt === "available" ? "Available" : "Busy"}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Assigned ({active.length})</h2>
          <Link to="/my-deliveries" className="text-sm text-primary">Update status & location →</Link>
        </div>
        {active.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No active deliveries right now.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {active.map((o) => (
              <li key={o.id} className="p-3">
                <p className="font-semibold text-foreground">#{o.order_ref}</p>
                <p className="text-sm text-muted-foreground">{o.dropoff_address}</p>
                <p className="text-xs text-primary">{STATUS_LABEL[o.status] ?? o.status} · {shortTime(o.updated_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-foreground">Completed — rate your deliveries</h2>
        {done.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Completed deliveries will appear here.</p>
        ) : (
          <ul className="space-y-2">
            {done.map((o) => (
              <RateCard key={o.id} order={o} partnerId={partnerId!} userId={userId!}
                existing={ratings.data?.find((r) => r.order_id === o.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RateCard({ order, partnerId, userId, existing }: {
  order: { id: string; order_ref: string; dropoff_address: string; status: string; updated_at: string };
  partnerId: string; userId: string;
  existing?: { rating: number; comment: string | null } | undefined;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  useEffect(() => {
    if (existing) { setRating(existing.rating); setComment(existing.comment ?? ""); }
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("delivery_ratings").upsert(
        { order_id: order.id, partner_id: partnerId, rider_id: userId, rating, comment: comment.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "order_id,rider_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rating saved");
      qc.invalidateQueries({ queryKey: ["rider-ratings", partnerId, userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <p className="font-semibold text-foreground">#{order.order_ref} <span className="text-xs font-normal text-muted-foreground">· {STATUS_LABEL[order.status]}</span></p>
      <p className="text-sm text-muted-foreground">{order.dropoff_address}</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rate this delivery">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)} className="p-1">
            <Star className={`size-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <Textarea className="mt-2" maxLength={500} placeholder="How did it go? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button className="mt-2 w-full" size="sm" disabled={rating === 0 || save.isPending} onClick={() => save.mutate()}>
        {existing ? "Update rating" : "Save rating"}
      </Button>
    </li>
  );
}
