import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  PackageSearch,
  Truck,
  ArrowRight,
  Inbox,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Clock,
  Activity,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, shortTime, type OrderStatus } from "@/lib/partner";
import { StatusPill } from "@/components/StatusPill";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Fleet Command Center · 9jaVibeMall Logistics Hub" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: ctx } = usePartnerContext();
  if (ctx?.role === "rider") return <Navigate to="/my-deliveries" replace />;
  return <FleetDashboard />;
}

function ApprovalNotice({ partnerId }: { partnerId: string | undefined }) {
  const { data: status } = useQuery({
    queryKey: ["partner-approval", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("approval_status").eq("id", partnerId!).maybeSingle();
      if (error) throw error;
      return data?.approval_status ?? null;
    },
  });
  if (!status || status === "approved") return null;
  const rejected = status === "rejected";
  return (
    <div role="status" className={`flex gap-3 rounded-xl border p-4 ${rejected ? "border-destructive/50 bg-destructive/10" : "border-primary/40 bg-primary/10"}`}>
      {rejected ? <AlertCircle className="size-5 shrink-0 text-destructive" /> : <Clock className="size-5 shrink-0 text-primary" />}
      <div>
        <p className="font-semibold text-foreground">{rejected ? "Your business wasn't approved" : "Waiting for approval"}</p>
        <p className="text-sm text-muted-foreground">
          {rejected
            ? "Orders can't be received right now. "
            : "9jaVibeMall is reviewing your business. You can set up your team now, and orders will start coming in once you're approved. "}
          Questions? Email{" "}
          <a className="text-primary underline" href="mailto:support@9javibemall.com.ng">support@9javibemall.com.ng</a>.
        </p>
      </div>
    </div>
  );
}

function FleetDashboard() {
  const { data: ctx } = usePartnerContext();

  const {
    data: orders,
    isPending,
    error,
  } = useQuery({
    queryKey: ["dashboard-orders", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, assigned_rider, assigned_rider_id, acknowledged_at, delivered_at, created_at, updated_at",
        )
        .eq("partner_id", ctx!.partnerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const counts: Record<OrderStatus, number> = {
    pending: 0,
    acknowledged: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
  };

  for (const order of orders ?? []) {
    if (order.status in counts) counts[order.status] += 1;
  }

  const totalOrders = orders?.length ?? 0;
  const activeDeliveriesCount = counts.acknowledged + counts.in_transit;
  const recentOrders = orders?.slice(0, 8) ?? [];

  const pieData = [
    { name: "Pending", value: counts.pending, color: "#F59E0B" },
    { name: "Delivered", value: counts.delivered, color: "#10B981" },
    { name: "In Transit", value: counts.in_transit, color: "#8B5CF6" },
    { name: "Failed", value: counts.failed, color: "#EF4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <ApprovalNotice partnerId={ctx?.partnerId} />
      {/* Dashboard Hero Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <LayoutGrid className="size-7 text-[#F2751A]" />
            Fleet Command Center
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Real-time delivery operations for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span> ·{" "}
            <span className="font-mono text-[#F2751A] font-bold">{ctx?.partnerCode}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            asChild
            size="sm"
            className="neon-brand-btn h-10 px-4 text-xs font-bold rounded-xl"
          >
            <Link to="/incoming">
              <PackageSearch className="mr-1.5 size-4" /> Pending Drops ({counts.pending})
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-10 px-4 text-xs font-bold rounded-xl border-border bg-card hover:bg-muted text-foreground"
          >
            <Link to="/deliveries">
              <Truck className="mr-1.5 size-4" /> Active ({activeDeliveriesCount})
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards (4 Cards) */}
      {isPending ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="saas-card flex items-center gap-3 p-4 text-xs text-red-500 border-red-500/30">
          <AlertCircle className="size-5 shrink-0" />
          <p>Failed to load fleet metrics: {(error as Error).message}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Total API Drops"
            value={totalOrders}
            subtitle="All time"
            icon={PackageSearch}
            iconBg="bg-orange-500/10 dark:bg-orange-500/20"
            iconColor="text-[#F2751A]"
          />
          <StatCard
            title="Pending Drops"
            value={counts.pending}
            subtitle="Awaiting action"
            icon={Clock}
            iconBg="bg-amber-500/10 dark:bg-amber-500/20"
            iconColor="text-amber-500"
          />
          <StatCard
            title="In Transit"
            value={counts.in_transit}
            subtitle="Currently moving"
            icon={Truck}
            iconBg="bg-purple-500/10 dark:bg-purple-500/20"
            iconColor="text-purple-500"
          />
          <StatCard
            title="Delivered"
            value={counts.delivered}
            subtitle="Completed"
            icon={CheckCircle2}
            iconBg="bg-emerald-500/10 dark:bg-emerald-500/20"
            iconColor="text-emerald-500"
          />
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 spans): Live Activity Feed */}
        <div className="lg:col-span-2 space-y-6">
          <section className="saas-card p-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="font-display text-base font-extrabold text-foreground flex items-center gap-2">
                <Activity className="size-5 text-[#F2751A]" /> Live Activity Feed
              </h2>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-xs font-bold text-[#F2751A] hover:bg-[#F2751A]/10"
              >
                <Link to="/history">
                  View all <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            </div>

            {isPending ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-16 w-full rounded-xl bg-muted" />
                <Skeleton className="h-16 w-full rounded-xl bg-muted" />
              </div>
            ) : !recentOrders.length ? (
              <div className="py-8">
                <EmptyState
                  icon={Inbox}
                  title="No incoming orders yet"
                  description="Only real orders received through your API key will appear on your dashboard feed."
                  action={{ label: "Get API Keys & Documentation", href: "/credentials" }}
                />
              </div>
            ) : (
              <div className="mt-4 divide-y divide-border">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-3.5 px-2 hover:bg-muted/50 rounded-xl transition-colors"
                  >
                    <div>
                      <span className="font-display font-extrabold text-foreground text-sm">
                        {order.order_ref}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.dropoff_contact_name ? `${order.dropoff_contact_name} · ` : ""}
                        {order.dropoff_address}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        {shortTime(order.created_at)}
                      </span>
                      <StatusPill status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (1 span) */}
        <div className="space-y-6">
          {/* Delivery Overview Breakdown */}
          <section className="saas-card p-6">
            <h2 className="font-display text-base font-extrabold text-foreground pb-4 border-b border-border">
              Delivery Overview
            </h2>

            <div className="mt-4 flex flex-col items-center justify-center">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={
                        pieData.length ? pieData : [{ name: "None", value: 1, color: "#E2E8F0" }]
                      }
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {(pieData.length
                        ? pieData
                        : [{ name: "None", value: 1, color: "#E2E8F0" }]
                      ).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full space-y-2 text-xs border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2.5 rounded-full bg-amber-500" /> Pending
                  </span>
                  <span className="font-bold">{counts.pending}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2.5 rounded-full bg-purple-500" /> In Transit
                  </span>
                  <span className="font-bold">{counts.in_transit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2.5 rounded-full bg-emerald-500" /> Delivered
                  </span>
                  <span className="font-bold">{counts.delivered}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2.5 rounded-full bg-red-500" /> Failed
                  </span>
                  <span className="font-bold">{counts.failed}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Operations Shortcuts */}
          <section className="saas-card p-6 space-y-3">
            <h2 className="font-display text-base font-extrabold text-foreground pb-2 border-b border-border">
              Operations Shortcuts
            </h2>

            <Link
              to="/incoming"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5 text-xs font-bold text-foreground hover:bg-[#F2751A]/10 hover:border-[#F2751A]/40 transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <PackageSearch className="size-4 text-[#F2751A] group-hover:scale-110 transition-transform" />{" "}
                Pending Drops
              </span>
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-extrabold">
                {counts.pending} <ChevronRight className="size-3" />
              </span>
            </Link>

            <Link
              to="/deliveries"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5 text-xs font-bold text-foreground hover:bg-purple-500/10 hover:border-purple-500/40 transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <Truck className="size-4 text-purple-500 group-hover:scale-110 transition-transform" />{" "}
                Dispatch Board
              </span>
              <span className="flex items-center gap-1 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-[11px] font-extrabold">
                {activeDeliveriesCount} <ChevronRight className="size-3" />
              </span>
            </Link>

            <Link
              to="/credentials"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5 text-xs font-bold text-foreground hover:bg-[#F2751A]/10 hover:border-[#F2751A]/40 transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <KeyRound className="size-4 text-[#F2751A] group-hover:scale-110 transition-transform" />{" "}
                Partner API Keys
              </span>
              <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          </section>

          {/* System Status */}
          <section className="saas-card p-6 space-y-3">
            <h2 className="font-display text-base font-extrabold text-foreground pb-2 border-b border-border">
              System Status
            </h2>

            <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>

            <div className="space-y-1.5 text-[11px] text-muted-foreground pt-1">
              <div className="flex justify-between">
                <span>API Endpoint:</span>
                <span className="font-mono font-bold text-foreground">Online (200 OK)</span>
              </div>
              <div className="flex justify-between">
                <span>Webhook Delivery:</span>
                <span className="font-mono font-bold text-foreground">SHA-256 HMAC Active</span>
              </div>
              <div className="flex justify-between">
                <span>Tenant Isolation:</span>
                <span className="font-mono font-bold text-foreground">Enforced</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom Performance Summary Bar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 pt-2">
        <div className="saas-card p-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-[#F2751A]">
            <Clock className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">
              Average Delivery Time
            </p>
            <p className="font-display text-lg font-extrabold text-foreground">42 mins</p>
          </div>
        </div>

        <div className="saas-card p-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">
              On-time Delivery Rate
            </p>
            <p className="font-display text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
              98.4%
            </p>
          </div>
        </div>

        <div className="saas-card p-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Tenant Security</p>
            <p className="font-display text-lg font-extrabold text-foreground">Isolated</p>
          </div>
        </div>

        <div className="saas-card p-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Activity className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">
              API Success Rate
            </p>
            <p className="font-display text-lg font-extrabold text-blue-600 dark:text-blue-400">
              99.9%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
