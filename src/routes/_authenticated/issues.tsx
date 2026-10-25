import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ClipboardList, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { usePartnerContext, isAdminRole, shortTime } from "@/lib/partner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { IssueThread } from "@/components/IssueThread";

type IssueStatus = Database["public"]["Enums"]["issue_status"];

const STATUS: Record<IssueStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  in_progress: { label: "In progress", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  resolved: { label: "Resolved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
};

export const Route = createFileRoute("/_authenticated/issues")({
  head: () => ({
    meta: [
      { title: "Issue Reports · 9jaVibeMall Logistics" },
      { name: "description", content: "Track, update and close order and delivery issue reports." },
    ],
  }),
  component: IssuesPage,
});

function IssuesPage() {
  const { data: ctx } = usePartnerContext();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<IssueStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["issues", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_reports")
        .select("id, reporter_id, description, recommendation, status, resolution_note, resolved_at, created_at, updated_at, closed_at, orders(order_ref)")
        .eq("partner_id", ctx!.partnerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; status?: IssueStatus; description?: string }) => {
      const patch: Database["public"]["Tables"]["issue_reports"]["Update"] = {};
      if (v.status) {
        patch.status = v.status;
        patch.closed_at = v.status === "closed" ? new Date().toISOString() : null;
      }
      if (v.description !== undefined) patch.description = v.description;
      const { error } = await supabase.from("issue_reports").update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report updated");
      qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []).filter((r) => filter === "all" || r.status === filter);
  const isAdmin = isAdminRole(ctx?.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <ClipboardList className="size-7 text-primary" /> Issues
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "All issue reports from your team." : "Issue reports you've submitted."}
          </p>
        </div>
        <Button asChild>
          <Link to="/assist"><Plus className="mr-2 size-4" /> Report an issue</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "open", "in_progress", "resolved", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${filter === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {s === "all" ? "All" : STATUS[s].label} ({s === "all" ? data?.length ?? 0 : data?.filter((r) => r.status === s).length ?? 0})
          </button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No reports" description="Reports you submit from Issue Help appear here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Issue</th>
                <th className="p-3">Order</th>
                <th className="p-3">Status</th>
                <th className="p-3">Submitted</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canEdit = r.reporter_id === ctx?.userId || isAdmin;
                const expanded = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/60 align-top">
                      <td className="max-w-xs p-3 text-foreground"><p className="line-clamp-2">{r.description}</p>{r.resolution_note && <p className="mt-1 line-clamp-1 text-xs text-emerald-500">✓ {r.resolution_note}</p>}</td>
                      <td className="p-3 text-muted-foreground">{r.orders?.order_ref ?? "—"}</td>
                      <td className="p-3">
                        {canEdit ? (
                          <select
                            value={r.status}
                            onChange={(e) => update.mutate({ id: r.id, status: e.target.value as IssueStatus })}
                            className={`rounded-full border px-2 py-1 text-xs font-bold ${STATUS[r.status].cls}`}
                          >
                            {(Object.keys(STATUS) as IssueStatus[]).map((s) => (
                              <option key={s} value={s} className="bg-background text-foreground">{STATUS[s].label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`rounded-full border px-2 py-1 text-xs font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{shortTime(r.created_at)}</td>
                      <td className="whitespace-nowrap p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setOpenId(expanded ? null : r.id); setDraft(r.description); }}>
                          {expanded ? "Hide" : "View"}
                        </Button>
                        {canEdit && r.status !== "closed" && (
                          <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, status: "closed" })}>Close</Button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/60">
                        <td colSpan={5} className="space-y-3 bg-background/40 p-4">
                          {canEdit ? (
                            <div className="space-y-2">
                              <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} />
                              <Button size="sm" disabled={draft.trim().length < 5} onClick={() => update.mutate({ id: r.id, description: draft.trim() })}>
                                <Save className="mr-2 size-4" /> Save description
                              </Button>
                            </div>
                          ) : (
                            <p className="text-foreground">{r.description}</p>
                          )}
                          <IssueThread issue={r} canResolve={canEdit} userId={ctx?.userId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
