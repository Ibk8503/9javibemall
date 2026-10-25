import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LineChart,
  ShieldAlert,
  Download,
  Filter,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, type OrderStatus } from "@/lib/partner";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [{ title: "Analytics & Reports · 9jaVibeMall Logistics" }],
  }),
  component: Analytics,
});

interface OrderRow {
  id: string;
  order_ref: string;
  pickup_address: string;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  dropoff_address: string;
  dropoff_contact_name: string | null;
  dropoff_contact_phone: string | null;
  status: OrderStatus;
  created_at: string;
}

function Analytics() {
  const { data: ctx } = usePartnerContext();
  const isRestricted = ctx?.role === "rider";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const {
    data: orders,
    isPending,
    error,
  } = useQuery({
    queryKey: ["analytics-orders", ctx?.partnerId],
    enabled: !!ctx && !isRestricted,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_contact_name, dropoff_contact_phone, status, created_at",
        )
        .eq("partner_id", ctx!.partnerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OrderRow[];
    },
  });

  if (isRestricted) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
          <LineChart className="size-7 text-[#F2751A]" />
          Analytics & Performance Reports
        </h1>
        <section className="saas-card flex items-start gap-4 p-6 border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="mt-0.5 size-6 text-amber-500 shrink-0" />
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Restricted Feature</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Operational analytics, performance reporting, and data exports are restricted to
              partner Owners and Managers.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const filteredOrders = (orders ?? []).filter((order) => {
    const orderDate = new Date(order.created_at);
    if (startDate && orderDate < new Date(startDate)) return false;
    if (endDate) {
      const nextDay = new Date(endDate);
      nextDay.setDate(nextDay.getDate() + 1);
      if (orderDate >= nextDay) return false;
    }
    return true;
  });

  const counts: Record<OrderStatus, number> = {
    pending: 0,
    acknowledged: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
  };

  for (const order of filteredOrders) {
    if (order.status in counts) counts[order.status] += 1;
  }

  const totalOrders = filteredOrders.length;
  const deliveryRate = totalOrders > 0 ? Math.round((counts.delivered / totalOrders) * 100) : 0;

  const downloadBlob = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!filteredOrders.length) {
      toast.error("No orders available to export.");
      return;
    }
    setExporting(true);
    try {
      const escape = (row: (string | number)[]) => row.map((cell) => `"${cell}"`).join(",");
      const generatedAt = new Date().toISOString();

      const lines = [
        escape(["Report Generated", generatedAt]),
        escape(["Partner Fleet", ctx?.partnerName ?? "Partner"]),
        escape(["Date Range Start", startDate || "All time"]),
        escape(["Date Range End", endDate || "All time"]),
        "",
        escape(["SUMMARY METRICS"]),
        escape(["Total Orders", totalOrders]),
        escape(["Delivery Rate (%)", deliveryRate]),
        escape(["Pending Drops", counts.pending]),
        escape(["Acknowledged", counts.acknowledged]),
        escape(["In Transit", counts.in_transit]),
        escape(["Delivered", counts.delivered]),
        escape(["Failed", counts.failed]),
        "",
        escape(["ORDER DETAIL"]),
        escape([
          "Order Ref",
          "Pickup Address",
          "Pickup Contact Name",
          "Pickup Contact Phone",
          "Dropoff Address",
          "Dropoff Contact Name",
          "Dropoff Contact Phone",
          "Status",
          "Created Date",
        ]),
        ...filteredOrders.map((o) =>
          escape([
            o.order_ref,
            o.pickup_address,
            o.pickup_contact_name ?? "—",
            o.pickup_contact_phone ?? "—",
            o.dropoff_address,
            o.dropoff_contact_name ?? "—",
            o.dropoff_contact_phone ?? "—",
            o.status,
            new Date(o.created_at).toLocaleDateString("en-NG"),
          ]),
        ),
      ];

      downloadBlob(
        lines.join("\n"),
        "text/csv;charset=utf-8;",
        `analytics_report_${ctx?.partnerCode}_${new Date().toISOString().split("T")[0]}.csv`,
      );
      toast.success("CSV report downloaded successfully");
    } finally {
      setExporting(false);
    }
  };

  const exportJSON = () => {
    if (!filteredOrders.length) {
      toast.error("No orders available to export.");
      return;
    }
    setExporting(true);
    try {
      const report = {
        meta: {
          partner_name: ctx?.partnerName,
          partner_code: ctx?.partnerCode,
          generated_at: new Date().toISOString(),
          date_range: { start: startDate || null, end: endDate || null },
        },
        summary: {
          total_orders: totalOrders,
          delivery_rate_percent: deliveryRate,
          status_breakdown: counts,
        },
        orders: filteredOrders,
      };

      downloadBlob(
        JSON.stringify(report, null, 2),
        "application/json;charset=utf-8;",
        `analytics_report_${ctx?.partnerCode}_${new Date().toISOString().split("T")[0]}.json`,
      );
      toast.success("JSON report downloaded successfully");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <LineChart className="size-7 text-[#F2751A]" />
            Analytics & Performance Reports
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Performance analytics and exportable audit reports for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span>.
          </p>
        </div>
      </div>

      <section className="saas-card p-6">
        <h2 className="flex items-center gap-2 font-display text-sm font-extrabold text-foreground">
          <Filter className="size-4 text-[#F2751A]" /> Date Range Filter
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="w-full h-9 border-border bg-card text-foreground font-bold text-xs"
              disabled={!startDate && !endDate}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </section>

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
        </div>
      ) : error ? (
        <div className="saas-card p-4 text-xs text-red-500 border-red-500/30">
          Error loading analytics data: {(error as Error).message}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            title="Total Orders"
            value={totalOrders}
            subtitle="Filtered count"
            icon={LineChart}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-500"
          />
          <StatCard
            title="Success Rate"
            value={`${deliveryRate}%`}
            subtitle="Completion rate"
            icon={CheckCircle2}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-500"
          />
          <StatCard
            title="Active Jobs"
            value={counts.pending + counts.acknowledged + counts.in_transit}
            subtitle="In progress"
            icon={Clock}
            iconBg="bg-amber-500/10"
            iconColor="text-amber-500"
          />
        </div>
      )}

      {/* Distribution Cards */}
      <section className="saas-card p-6">
        <h2 className="font-display text-sm font-extrabold text-foreground">
          Status Distribution Breakdown
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Pending</span>
            <span className="block font-display text-2xl font-extrabold text-amber-500 mt-1">
              {counts.pending}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">
              Acknowledged
            </span>
            <span className="block font-display text-2xl font-extrabold text-sky-500 mt-1">
              {counts.acknowledged}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">
              In Transit
            </span>
            <span className="block font-display text-2xl font-extrabold text-purple-500 mt-1">
              {counts.in_transit}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Delivered</span>
            <span className="block font-display text-2xl font-extrabold text-emerald-500 mt-1">
              {counts.delivered}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Failed</span>
            <span className="block font-display text-2xl font-extrabold text-red-500 mt-1">
              {counts.failed}
            </span>
          </div>
        </div>
      </section>

      {/* Export Controls */}
      <section className="saas-card p-6 border-[#F2751A]/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
              <Download className="size-5 text-[#F2751A]" /> Audit Data Export
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Download timestamped audit files containing delivery metrics and order-level detail.
            </p>
          </div>
          <span className="rounded-full bg-muted border border-border px-3 py-1 text-xs font-extrabold text-foreground">
            {totalOrders} Records
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Button
            onClick={exportCSV}
            disabled={exporting || totalOrders === 0}
            className="neon-brand-btn flex-1 h-11 text-xs font-extrabold rounded-xl"
          >
            <FileSpreadsheet className="mr-2 size-4" /> Export as CSV Report
          </Button>

          <Button
            onClick={exportJSON}
            disabled={exporting || totalOrders === 0}
            variant="outline"
            className="flex-1 h-11 text-xs font-extrabold rounded-xl border-border bg-card text-foreground hover:bg-muted"
          >
            <FileCode className="mr-2 size-4" /> Export as JSON Dataset
          </Button>
        </div>
      </section>
    </div>
  );
}
