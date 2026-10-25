import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Webhook,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Copy,
  Code2,
  Terminal,
  Send,
  AlertTriangle,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Trash2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext } from "@/lib/partner";
import { dispatchOrderWebhook, getLocalWebhookLogs, type WebhookDispatchLog } from "@/lib/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({
    meta: [{ title: "Webhook Logs & Inspector · 9jaVibeMall Logistics" }],
  }),
  component: WebhookLogsPage,
});

function copyToClipboard(text: string, label = "Copied") {
  void navigator.clipboard?.writeText(text);
  toast.success(`${label} copied to clipboard!`);
}

function WebhookLogsPage() {
  const { data: ctx } = usePartnerContext();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WebhookDispatchLog | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Test Dispatch Form State
  const [testProviderCode, setTestProviderCode] = useState("9javibemall-partners");
  const [testWebhookUrl, setTestWebhookUrl] = useState("http://localhost:8000/api/v1/orders/9javibemall-partners/webhook");
  const [testOrderRef, setTestOrderRef] = useState("R9B-ORD-TEST-001");
  const [testEvent, setTestEvent] = useState<"out_for_delivery" | "delivered">("delivered");
  const [isTestDispatching, setIsTestDispatching] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleProviderCodeChange = (code: string) => {
    setTestProviderCode(code);
    setTestWebhookUrl(`http://localhost:8000/api/v1/orders/${code}/webhook`);
  };

  // Fetch Webhook Logs from Supabase with Local Buffer Merge
  const {
    data: logs = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["webhook_logs", ctx?.partnerId],
    queryFn: async () => {
      let dbLogs: WebhookDispatchLog[] = [];
      try {
        const { data, error } = await supabase
          .from("webhook_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data) {
          dbLogs = data.map((d: any) => ({
            id: d.id,
            partner_id: d.partner_id,
            order_id: d.order_id || "",
            order_ref: d.order_ref,
            webhook_url: d.webhook_url,
            event: d.event,
            request_headers: (d.request_headers as Record<string, string>) || {},
            request_payload: d.request_payload as any,
            signature: d.signature || "",
            response_status: d.response_status,
            response_body: d.response_body,
            duration_ms: d.duration_ms || 0,
            error: d.error,
            created_at: d.created_at,
          }));
        }
      } catch (err) {
        console.warn("[Webhook Logs] Supabase fetch error, using local buffer:", err);
      }

      // Merge with local logs to prevent missing any immediate dispatches
      const local = getLocalWebhookLogs();
      const combinedMap = new Map<string, WebhookDispatchLog>();

      local.forEach((l) => combinedMap.set(l.id, l));
      dbLogs.forEach((l) => combinedMap.set(l.id, l));

      return Array.from(combinedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Test Webhook Dispatch Mutation
  const handleTestDispatch = async () => {
    if (!testWebhookUrl.trim()) {
      toast.error("Please enter a valid target Webhook URL");
      return;
    }

    setIsTestDispatching(true);
    setTestResult(null);

    try {
      const res = await dispatchOrderWebhook(
        testWebhookUrl.trim(),
        testOrderRef.trim() || "TEST-ORD-001",
        testEvent,
        {
          partnerId: ctx?.partnerId,
          orderRef: testOrderRef.trim() || "TEST-ORD-001",
          throwOnError: true,
        }
      );

      setTestResult(res);
      toast.success(`Webhook dispatched! Status: ${res.statusCode || "200"}`);
      void queryClient.invalidateQueries({ queryKey: ["webhook_logs"] });
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Failed to dispatch webhook",
      });
      toast.error(`Dispatch failed: ${err.message || "Network Error"}`);
    } finally {
      setIsTestDispatching(false);
    }
  };

  // Re-dispatch single existing log
  const handleRedispatchLog = async (log: WebhookDispatchLog) => {
    toast.loading("Re-dispatching webhook...", { id: "redispatch" });
    try {
      const res = await dispatchOrderWebhook(log.webhook_url, log.order_ref || log.order_id, log.event, {
        partnerId: ctx?.partnerId,
        orderRef: log.order_ref,
        throwOnError: true,
      });
      toast.success(`Webhook re-sent successfully! Status: ${res.statusCode}`, { id: "redispatch" });
      void queryClient.invalidateQueries({ queryKey: ["webhook_logs"] });
    } catch (err: any) {
      toast.error(`Re-dispatch failed: ${err.message}`, { id: "redispatch" });
    }
  };

  // Clear Logs Mutation
  const clearMutation = useMutation({
    mutationFn: async () => {
      try {
        await supabase.from("webhook_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (err) {
        console.warn("[Webhook Logs] Supabase delete warning:", err);
      }
    },
    onSuccess: () => {
      toast.success("Webhook dispatch logs cleared.");
      queryClient.invalidateQueries({ queryKey: ["webhook_logs"] });
      setClearDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        log.order_ref?.toLowerCase().includes(q) ||
        log.order_id.toLowerCase().includes(q) ||
        log.webhook_url.toLowerCase().includes(q) ||
        log.event.toLowerCase().includes(q);

      const matchesEvent = selectedEvent === "all" || log.event === selectedEvent;

      let matchesStatus = true;
      if (selectedStatus === "success") {
        matchesStatus = Boolean(log.response_status && log.response_status >= 200 && log.response_status < 300);
      } else if (selectedStatus === "error") {
        matchesStatus = Boolean(
          log.response_status && log.response_status >= 400 || log.response_status === 0 || log.error
        );
      } else if (selectedStatus === "timeout") {
        matchesStatus = Boolean(log.response_status === 0 || log.error?.toLowerCase().includes("timeout"));
      }

      return matchesQuery && matchesEvent && matchesStatus;
    });
  }, [logs, searchQuery, selectedEvent, selectedStatus]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = logs.length;
    const successful = logs.filter(
      (l) => l.response_status && l.response_status >= 200 && l.response_status < 300
    ).length;
    const failed = logs.filter(
      (l) => (l.response_status && l.response_status >= 400) || l.response_status === 0 || l.error
    ).length;
    const avgDuration =
      total > 0
        ? Math.round(logs.reduce((acc, l) => acc + (l.duration_ms || 0), 0) / total)
        : 0;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;

    return { total, successful, failed, avgDuration, successRate };
  }, [logs]);

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/20">
              <Webhook className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
                Webhook Logs & Inspector
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Audit trail of all outbound SHA-256 signed order drop webhooks, payloads, and responses.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`rounded-xl border-border ${
              autoRefresh ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-card text-muted-foreground"
            }`}
          >
            <Activity className={`mr-1.5 size-3.5 ${autoRefresh ? "animate-pulse" : ""}`} />
            {autoRefresh ? "Live (5s)" : "Paused"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="rounded-xl border-border bg-card hover:bg-muted text-foreground"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isRefetching ? "animate-spin text-[#F2751A]" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setTestModalOpen(true)}
            className="neon-brand-btn rounded-xl font-bold text-xs shadow-sm"
          >
            <Send className="mr-1.5 size-3.5" /> Test Webhook Dispatch
          </Button>

          {logs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="rounded-xl border-border text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Dispatches</span>
            <Layers className="size-4 text-muted-foreground" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-foreground mt-2 font-display">{stats.total}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Recorded outbound events</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Delivered / 2xx OK
            </span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-display">
              {stats.successful}
            </p>
            <span className="text-xs font-bold text-emerald-600/80">({stats.successRate}%)</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Receiver accepted payload</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">Failed / Errors</span>
            <XCircle className="size-4 text-red-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-red-500 mt-2 font-display">{stats.failed}</p>
          <p className="text-[11px] text-muted-foreground mt-1">4xx, 5xx, or network timeouts</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Latency</span>
            <Clock className="size-4 text-[#F2751A]" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-foreground mt-2 font-display">
            {stats.avgDuration} <span className="text-sm font-normal text-muted-foreground">ms</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">HTTP round-trip time</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by Order Ref (R9B-ORD-...), Webhook URL, or Event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-background/50 border-border text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Event Filter */}
          <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border text-xs font-medium">
            <button
              onClick={() => setSelectedEvent("all")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedEvent === "all" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setSelectedEvent("out_for_delivery")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedEvent === "out_for_delivery"
                  ? "bg-card text-[#F2751A] font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Out For Delivery
            </button>
            <button
              onClick={() => setSelectedEvent("delivered")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedEvent === "delivered"
                  ? "bg-card text-emerald-600 font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Delivered
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border text-xs font-medium">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedStatus === "all" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStatus("success")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedStatus === "success" ? "bg-card text-emerald-600 font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              2xx Success
            </button>
            <button
              onClick={() => setSelectedStatus("error")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedStatus === "error" ? "bg-card text-red-500 font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Errors
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table / List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-card border border-border/80 shadow-sm flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[#F2751A]/10 flex items-center justify-center text-[#F2751A] mb-4">
            <Webhook className="size-7" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No webhook dispatch logs found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
            {searchQuery
              ? "No webhook dispatches match your search filters."
              : "Whenever an order changes to 'out_for_delivery' or 'delivered', its signed webhook dispatch will automatically appear here."}
          </p>
          <Button onClick={() => setTestModalOpen(true)} className="neon-brand-btn rounded-xl text-xs font-bold">
            <Send className="mr-1.5 size-3.5" /> Dispatch a Test Webhook
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Status & Code</th>
                  <th className="py-3.5 px-4">Order Ref</th>
                  <th className="py-3.5 px-4">Event Trigger</th>
                  <th className="py-3.5 px-4">Target Webhook URL</th>
                  <th className="py-3.5 px-4">Latency</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map((log) => {
                  const isSuccess = log.response_status && log.response_status >= 200 && log.response_status < 300;
                  const isError = !isSuccess;

                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Status Code */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isSuccess ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-mono font-bold text-xs gap-1 py-1">
                            <CheckCircle2 className="size-3" />
                            {log.response_status} OK
                          </Badge>
                        ) : log.response_status ? (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 font-mono font-bold text-xs gap-1 py-1">
                            <XCircle className="size-3" />
                            {log.response_status} Error
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-mono font-bold text-xs gap-1 py-1">
                            <AlertTriangle className="size-3" />
                            Failed / Timeout
                          </Badge>
                        )}
                      </td>

                      {/* Order Ref */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono font-bold text-foreground text-xs bg-muted/60 px-2 py-0.5 rounded-md border border-border">
                            {log.order_ref || log.order_id?.slice(0, 13) || "N/A"}
                          </code>
                          <button
                            onClick={() => copyToClipboard(log.order_ref || log.order_id, "Order reference")}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy Order ID"
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                      </td>

                      {/* Event */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${
                            log.event === "delivered"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/20"
                          }`}
                        >
                          {log.event}
                        </span>
                      </td>

                      {/* Webhook URL */}
                      <td className="py-3.5 px-4 max-w-xs truncate">
                        <span className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer" title={log.webhook_url}>
                          {log.webhook_url}
                        </span>
                      </td>

                      {/* Latency */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-xs font-mono text-muted-foreground">{log.duration_ms} ms</span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedLog(log)}
                            className="h-8 px-2.5 rounded-lg text-xs font-bold text-foreground hover:bg-muted"
                          >
                            <Code2 className="mr-1 size-3 text-[#F2751A]" /> Inspect
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRedispatchLog(log)}
                            title="Re-send Webhook"
                            className="h-8 px-2 rounded-lg text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INSPECT LOG MODAL */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#F2751A]/10 text-[#F2751A]">
                <Webhook className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold font-display">
                  Webhook Dispatch Inspector
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Complete request payload, SHA-256 HMAC signature, and response trace.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-5 pt-2">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">HTTP Result</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    {selectedLog.response_status && selectedLog.response_status >= 200 && selectedLog.response_status < 300 ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <XCircle className="size-4 text-red-500" />
                    )}
                    <span className="font-mono font-bold text-sm">
                      {selectedLog.response_status ? `${selectedLog.response_status} Code` : "Failed"}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Event Trigger</span>
                  <p className="font-bold text-sm text-[#F2751A] capitalize mt-1">{selectedLog.event}</p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Response Latency</span>
                  <p className="font-mono font-bold text-sm text-foreground mt-1">{selectedLog.duration_ms} ms</p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Dispatched At</span>
                  <p className="font-medium text-xs text-foreground mt-1">
                    {format(new Date(selectedLog.created_at), "HH:mm:ss.SSS")}
                  </p>
                </div>
              </div>

              {/* Target Webhook Endpoint */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border flex items-center justify-between">
                <div className="flex-1 mr-2 truncate">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block mb-0.5">
                    Target Endpoint URL:
                  </span>
                  <code className="font-mono text-xs text-foreground select-all break-all">{selectedLog.webhook_url}</code>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(selectedLog.webhook_url, "URL")}
                  className="rounded-lg h-8 text-xs shrink-0"
                >
                  <Copy className="size-3 mr-1" /> Copy
                </Button>
              </div>

              {/* Tabs for Payload, Headers, Response */}
              <Tabs defaultValue="payload" className="w-full">
                <TabsList className="grid grid-cols-3 bg-muted/60 border border-border p-1 rounded-xl">
                  <TabsTrigger value="payload" className="text-xs font-bold rounded-lg">
                    Request Payload
                  </TabsTrigger>
                  <TabsTrigger value="headers" className="text-xs font-bold rounded-lg">
                    Request Headers
                  </TabsTrigger>
                  <TabsTrigger value="response" className="text-xs font-bold rounded-lg">
                    Endpoint Response
                  </TabsTrigger>
                </TabsList>

                {/* Tab: Request Payload */}
                <TabsContent value="payload" className="space-y-3 pt-3">
                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-black/90 text-emerald-400 font-mono text-xs overflow-x-auto border border-emerald-950/50 shadow-inner max-h-64">
                      {JSON.stringify(selectedLog.request_payload, null, 2)}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedLog.request_payload, null, 2), "Payload")}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      title="Copy JSON Payload"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>

                  {/* SHA-256 Signature */}
                  <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[#F2751A] flex items-center gap-1.5">
                        <ShieldCheck className="size-3.5" /> Computed X-Webhook-Signature (SHA-256):
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedLog.signature, "Signature")}
                        className="text-[11px] font-bold text-[#F2751A] hover:underline"
                      >
                        Copy Digest
                      </button>
                    </div>
                    <code className="font-mono text-xs text-foreground break-all select-all block bg-card p-2 rounded-lg border border-border">
                      {selectedLog.signature}
                    </code>
                  </div>
                </TabsContent>

                {/* Tab: Headers */}
                <TabsContent value="headers" className="pt-3">
                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-black/90 text-cyan-300 font-mono text-xs overflow-x-auto border border-cyan-950/50 shadow-inner">
                      {Object.entries(selectedLog.request_headers || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")}
                    </pre>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          Object.entries(selectedLog.request_headers || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("\n"),
                          "Headers"
                        )
                      }
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </TabsContent>

                {/* Tab: Response */}
                <TabsContent value="response" className="space-y-3 pt-3">
                  {selectedLog.error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>{selectedLog.error}</span>
                    </div>
                  )}

                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-black/90 text-yellow-300 font-mono text-xs overflow-x-auto border border-yellow-950/50 shadow-inner max-h-64">
                      {selectedLog.response_body
                        ? (() => {
                            try {
                              return JSON.stringify(JSON.parse(selectedLog.response_body), null, 2);
                            } catch {
                              return selectedLog.response_body;
                            }
                          })()
                        : "(No response body returned from server)"}
                    </pre>
                    {selectedLog.response_body && (
                      <button
                        onClick={() => copyToClipboard(selectedLog.response_body!, "Response Body")}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-4 mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedLog && handleRedispatchLog(selectedLog)}
              className="rounded-xl font-bold text-xs"
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Re-dispatch Webhook
            </Button>
            <Button size="sm" onClick={() => setSelectedLog(null)} className="rounded-xl font-bold text-xs">
              Close Inspector
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SEND TEST WEBHOOK MODAL */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#F2751A]/10 text-[#F2751A]">
                <Send className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold font-display">Test Webhook Dispatch</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Send a live SHA-256 signed test webhook payload to your backend or endpoint.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1.5">
                Logistics Provider Driver Code
              </label>
              <select
                value={testProviderCode}
                onChange={(e) => handleProviderCodeChange(e.target.value)}
                className="w-full h-10 rounded-xl bg-background border border-border px-3 text-xs font-bold text-foreground"
              >
                <option value="9javibemall-partners">9jaVibeMall Partners (Internal)</option>
                <option value="pepsa">Pepsa Logistics (External API)</option>
                <option value="kadpick">KadPick Logistics (External API)</option>
                <option value="millennium">Millennium Logistics (External API)</option>
                <option value="smart">Smart Logistics (Internal Driver)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1.5">
                Target Webhook URL
              </label>
              <Input
                placeholder="http://localhost:8000/api/v1/orders/9javibemall-partners/webhook"
                value={testWebhookUrl}
                onChange={(e) => setTestWebhookUrl(e.target.value)}
                className="font-mono text-xs h-10 rounded-xl bg-background/60 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1.5">
                  Order Reference
                </label>
                <Input
                  placeholder="R9B-ORD-20260831-ED9177F0"
                  value={testOrderRef}
                  onChange={(e) => setTestOrderRef(e.target.value)}
                  className="font-mono text-xs h-10 rounded-xl bg-background/60 border-border"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1.5">
                  Status Event
                </label>
                <select
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value as any)}
                  className="w-full h-10 rounded-xl bg-background border border-border px-3 text-xs font-bold text-foreground"
                >
                  <option value="delivered">delivered</option>
                  <option value="out_for_delivery">out_for_delivery</option>
                </select>
              </div>
            </div>

            {/* Test Result Output */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-mono space-y-1.5 ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 border-red-500/30 text-red-500"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{testResult.success ? "✅ Dispatch Succeeded" : "❌ Dispatch Failed"}</span>
                  {testResult.statusCode && <span>HTTP {testResult.statusCode}</span>}
                </div>
                {testResult.durationMs && <div>Latency: {testResult.durationMs}ms</div>}
                {testResult.responseBody && (
                  <pre className="p-2 rounded bg-black/80 text-white text-[11px] overflow-x-auto max-h-32 mt-1">
                    {testResult.responseBody}
                  </pre>
                )}
                {testResult.error && <div>Error: {testResult.error}</div>}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-4 mt-2">
            <Button variant="outline" size="sm" onClick={() => setTestModalOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleTestDispatch}
              disabled={isTestDispatching}
              className="neon-brand-btn rounded-xl font-bold text-xs"
            >
              {isTestDispatching ? (
                <>
                  <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> Dispatching...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" /> Send Test Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLEAR LOGS CONFIRMATION */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500 font-display">
              <Trash2 className="size-5" /> Clear Webhook Dispatch Logs
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete all recorded webhook dispatch logs? This will clear the inspection history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearMutation.mutate()}
              className="bg-red-600 text-white hover:bg-red-700 font-bold"
            >
              Clear Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
