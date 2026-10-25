import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, Clock, ShieldCheck, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { shortTime } from "@/lib/partner";
import { useIsSupport } from "@/lib/support";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";

const TITLE = "Partners Monitor · 9jaVibeMall Logistics";
const DESC = "Live view of every partner's incoming and completed orders across 9jaVibeMall.";

export const Route = createFileRoute("/_authenticated/partners-monitor")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnersMonitor,
});

function PartnersMonitor() {
  const { data: isSupport, isLoading } = useIsSupport();
  if (isLoading) return null;
  if (!isSupport) {
    return <EmptyState icon={ShieldCheck} title="Platform account only" description="This page is only for the 9jaVibeMall platform account." />;
  }
  return <Monitor />;
}

function Monitor() {
  const qc = useQueryClient();
  const since = useMemo(() => new Date(Date.now() - 30 * 86400_000).toISOString(), []);

  const { data: partners } = useQuery({
    queryKey: ["monitor-partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id, name, partner_code, approval_status");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["monitor-orders", since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, partner_id, order_ref, status, dropoff_address, created_at, updated_at, delivered_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("partners-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void qc.invalidateQueries({ queryKey: ["monitor-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "partners" }, () => {
        void qc.invalidateQueries({ queryKey: ["monitor-partners"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = startOfDay.getTime();
  const list = orders ?? [];
  const isToday = (v: string | null) => !!v && new Date(v).getTime() >= today;

  const totals = {
    inToday: list.filter((o) => isToday(o.created_at)).length,
    outToday: list.filter((o) => o.status === "delivered" && isToday(o.delivered_at ?? o.updated_at)).length,
    open: list.filter((o) => ["pending", "acknowledged", "in_transit"].includes(o.status)).length,
    failed: list.filter((o) => o.status === "failed" && isToday(o.updated_at)).length,
  };

  const rows = (partners ?? [])
    .map((p) => {
      const mine = list.filter((o) => o.partner_id === p.id);
      return {
        ...p,
        inflow: mine.length,
        inToday: mine.filter((o) => isToday(o.created_at)).length,
        pending: mine.filter((o) => o.status === "pending").length,
        moving: mine.filter((o) => o.status === "acknowledged" || o.status === "in_transit").length,
        delivered: mine.filter((o) => o.status === "delivered").length,
        failed: mine.filter((o) => o.status === "failed").length,
        last: mine[0]?.created_at ?? null,
      };
    })
    .sort((a, b) => b.inflow - a.inflow);
  const partnerName = new Map((partners ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Partners Monitor</h1>
          <p className="text-sm text-muted-foreground">Orders coming in and going out across every partner — last 30 days.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <span className="size-2 animate-pulse rounded-full bg-primary" /> Live
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ArrowDownLeft} label="Inflow today" value={totals.inToday} />
        <Stat icon={ArrowUpRight} label="Delivered today" value={totals.outToday} />
        <Stat icon={Clock} label="Open orders" value={totals.open} />
        <Stat icon={XCircle} label="Failed today" value={totals.failed} />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-semibold text-foreground">By partner</h2>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No partners yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {["Partner", "In (30d)", "Today", "Pending", "On the way", "Delivered", "Failed", "Last order"].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.partner_code} · {r.approval_status}</div>
                    </td>
                    <td className="px-4 py-2 font-semibold text-foreground">{r.inflow}</td>
                    <td className="px-4 py-2">{r.inToday}</td>
                    <td className="px-4 py-2">{r.pending}</td>
                    <td className="px-4 py-2">{r.moving}</td>
                    <td className="px-4 py-2 text-primary">{r.delivered}</td>
                    <td className="px-4 py-2 text-destructive">{r.failed}</td>
                    <td className="px-4 py-2 text-muted-foreground">{shortTime(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold text-foreground">
          <Activity className="size-4 text-primary" /> Live order feed
        </h2>
        {list.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No orders in the last 30 days.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...list]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 25)
              .map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{o.order_ref} · {partnerName.get(o.partner_id) ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.dropoff_address}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={o.status} />
                    <span className="text-xs text-muted-foreground">{shortTime(o.updated_at)}</span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4 text-primary" />{label}</div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}
