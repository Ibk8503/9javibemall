import { lazy, Suspense, useEffect, useMemo } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { memberName, type TeamMember } from "@/lib/support";
import { Button } from "@/components/ui/button";

const RiderMap = lazy(() => import("./RiderMap"));

interface OrderLite {
  id: string;
  order_ref: string;
  status: string;
  assigned_rider_id: string | null;
  acknowledged_at: string | null;
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

export function LiveRidersPanel({
  partnerId,
  riders,
  orders,
  onAssign,
}: {
  partnerId: string;
  riders: TeamMember[];
  orders: OrderLite[];
  onAssign: (orderId: string, riderId: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: locations } = useQuery({
    queryKey: ["rider-locations", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_locations")
        .select("user_id, latitude, longitude, updated_at, order_id")
        .eq("partner_id", partnerId);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`rider-locations-${partnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_locations", filter: `partner_id=eq.${partnerId}` }, () =>
        qc.invalidateQueries({ queryKey: ["rider-locations", partnerId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [partnerId, qc]);

  const next = orders
    .filter((o) => !o.assigned_rider_id && (o.status === "acknowledged" || o.status === "pending"))
    .sort((a, b) => (a.acknowledged_at ?? "").localeCompare(b.acknowledged_at ?? ""))[0];

  const sendNext = useMutation({
    mutationFn: async (riderId: string) => {
      if (!next) throw new Error("No unassigned deliveries waiting");
      await onAssign(next.id, riderId);
      return next.order_ref;
    },
    onSuccess: (ref) => toast.success(`Rider sent to ${ref}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      riders.map((r) => {
        const loc = locations?.find((l) => l.user_id === r.user_id);
        const activeCount = orders.filter((o) => o.assigned_rider_id === r.user_id && o.status !== "delivered" && o.status !== "failed").length;
        return { r, loc, activeCount, fresh: !!loc && Date.now() - new Date(loc.updated_at).getTime() < 5 * 60_000 };
      }),
    [riders, locations, orders],
  );

  const points = rows
    .filter((x) => x.loc)
    .map((x) => ({ id: x.r.user_id, name: memberName(x.r), lat: x.loc!.latitude, lng: x.loc!.longitude, updatedAt: x.loc!.updated_at, active: x.fresh }));

  return (
    <section className="saas-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
          <MapPin className="size-5 text-primary" /> Live rider locations
        </h2>
        <p className="text-xs text-muted-foreground">
          {next ? `Next waiting: ${next.order_ref}` : "No unassigned deliveries waiting"}
        </p>
      </div>
      <ClientOnly fallback={<div className="h-80 w-full animate-pulse rounded-xl bg-muted" />}>
        <Suspense fallback={<div className="h-80 w-full animate-pulse rounded-xl bg-muted" />}>
          <RiderMap riders={points} />
        </Suspense>
      </ClientOnly>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No riders on your team yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ r, loc, activeCount, fresh }) => (
            <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <p className="font-bold text-foreground">
                  <span className={`mr-2 inline-block size-2 rounded-full ${fresh ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                  {memberName(r)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {loc ? `Seen ${ago(loc.updated_at)}` : "No location shared yet"} · {activeCount} active
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={!next || sendNext.isPending} onClick={() => sendNext.mutate(r.user_id)}>
                <Send className="mr-1.5 size-3.5" /> Send to next delivery
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
