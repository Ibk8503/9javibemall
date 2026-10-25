import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Inbox, Mail, MailX, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { shortTime } from "@/lib/partner";
import { useIsSupport } from "@/lib/support";
import { IssueThread } from "@/components/IssueThread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type IssueStatus = Database["public"]["Enums"]["issue_status"];
const STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "closed"];
const LABEL: Record<IssueStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" };

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support Desk · 9jaVibeMall Logistics" },
      { name: "description", content: "All partner issue reports, support emails and replies in one place." },
    ],
  }),
  component: SupportDesk,
});

function SupportDesk() {
  const { data: isSupport, isPending: checking } = useIsSupport();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<IssueStatus | "all">("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"reports" | "emails">("reports");
  const [me, setMe] = useState<string>();
  const [myEmail, setMyEmail] = useState<string>();

  const { data, isPending, error } = useQuery({
    queryKey: ["support-issues"],
    enabled: !!isSupport,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u.user?.id);
      setMyEmail(u.user?.email ?? undefined);
      const { data, error } = await supabase
        .from("issue_reports")
        .select("id, description, recommendation, status, resolution_note, resolved_at, emailed_at, created_at, partners(name, partner_code), orders(order_ref), issue_replies(count)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: IssueStatus }) => {
      const { error } = await supabase
        .from("issue_reports")
        .update({ status: v.status, closed_at: v.status === "closed" ? new Date().toISOString() : null })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-issues"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (checking) return <Skeleton className="h-40 w-full" />;
  if (!isSupport)
    return <p className="text-sm text-muted-foreground">The Support Desk is only available to 9jaVibeMall support staff.</p>;

  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!term || r.description.toLowerCase().includes(term) || (r.partners?.name ?? "").toLowerCase().includes(term) || (r.orders?.order_ref ?? "").toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
          <ShieldCheck className="size-7 text-primary" /> Support Desk
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Every issue report emailed to {myEmail ?? "your account"}, with replies, in one place.</p>
      </div>

      <div className="flex gap-2">
        {([["reports", "Issue reports"], ["emails", "Support inbox"]] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-bold ${tab === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "emails" ? (
        <EmailLog />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${filter === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {s === "all" ? "All" : LABEL[s]} ({s === "all" ? data?.length ?? 0 : data?.filter((r) => r.status === s).length ?? 0})
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search partner, order, text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports match.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Partner</th>
                <th className="p-3">Issue</th>
                <th className="p-3">Email</th>
                <th className="p-3">Replies</th>
                <th className="p-3">Status</th>
                <th className="p-3">Received</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expanded = openId === r.id;
                const replyCount = (r.issue_replies as unknown as { count: number }[])?.[0]?.count ?? 0;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/60 align-top">
                      <td className="p-3">
                        <p className="font-bold text-foreground">{r.partners?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.orders?.order_ref ?? "No order"}</p>
                      </td>
                      <td className="max-w-xs p-3 text-foreground"><p className="line-clamp-2">{r.description}</p></td>
                      <td className="p-3">
                        {r.emailed_at ? (
                          <span title={`Emailed ${shortTime(r.emailed_at)}`}><Mail className="size-4 text-emerald-500" /></span>
                        ) : (
                          <span title="Not emailed"><MailX className="size-4 text-muted-foreground" /></span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{replyCount}</td>
                      <td className="p-3">
                        <select
                          value={r.status}
                          onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as IssueStatus })}
                          className="rounded-full border border-border bg-background px-2 py-1 text-xs font-bold text-foreground"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{shortTime(r.created_at)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant={expanded ? "ghost" : "default"} onClick={() => setOpenId(expanded ? null : r.id)}>{expanded ? "Hide" : "Reply"}</Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/60">
                        <td colSpan={7} className="space-y-3 bg-background/40 p-4">
                          <p className="whitespace-pre-wrap text-foreground">{r.description}</p>
                          <IssueThread issue={r} canResolve userId={me} />
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
      </>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  issue_report: "Issue report",
  issue_reply: "Support reply",
  delivery_update: "Delivery update",
};

function EmailLog({ me }: { me?: string | undefined }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | keyof typeof KIND_LABEL>("all");
  const { data, isPending, error } = useQuery({
    queryKey: ["support-email-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_emails")
        .select("id, kind, subject, recipients, reply_to, order_ref, partner_name, body_preview, status, error, created_at, issue_reports(id, description, recommendation, resolution_note, resolved_at)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (!term ||
        r.subject.toLowerCase().includes(term) ||
        (r.order_ref ?? "").toLowerCase().includes(term) ||
        (r.partner_name ?? "").toLowerCase().includes(term) ||
        (r.body_preview ?? "").toLowerCase().includes(term) ||
        r.recipients.join(" ").toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "issue_report", "issue_reply", "delivery_update"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {k === "all" ? "All" : KIND_LABEL[k]} ({k === "all" ? data?.length ?? 0 : data?.filter((r) => r.kind === k).length ?? 0})
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search subject, order, recipient" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox className="size-4" /> No support emails yet. Issue reports, support replies and delivery updates appear here as they are sent.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{KIND_LABEL[r.kind] ?? r.kind}</span>
                {r.status === "sent" ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-500"><Mail className="size-3.5" /> Sent</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-destructive"><MailX className="size-3.5" /> Failed</span>
                )}
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{shortTime(r.created_at)}</span>
              </div>
              <p className="mt-2 font-bold text-foreground">{r.subject}</p>
              {r.body_preview && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-3">{r.body_preview}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                To {r.recipients.join(", ") || "—"}
                {r.reply_to ? ` · replies to ${r.reply_to}` : ""}
                {r.partner_name ? ` · ${r.partner_name}` : ""}
                {r.order_ref ? ` · ${r.order_ref}` : ""}
              </p>
              {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
              {r.issue_reports && (
                <div className="mt-3">
                  <Button size="sm" variant={openId === r.id ? "ghost" : "default"} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    {openId === r.id ? "Hide" : "Reply"}
                  </Button>
                  {openId === r.id && (
                    <div className="mt-3 space-y-3 rounded-xl bg-background/40 p-3">
                      <p className="whitespace-pre-wrap text-sm text-foreground">{r.issue_reports.description}</p>
                      <IssueThread issue={r.issue_reports} canResolve userId={me} />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
