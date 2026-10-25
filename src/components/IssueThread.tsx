import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { replyToIssue } from "@/lib/delivery-support.functions";
import { shortTime } from "@/lib/partner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ThreadIssue {
  id: string;
  recommendation: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
}

export function IssueThread({ issue, canResolve, userId }: { issue: ThreadIssue; canResolve: boolean; userId?: string | undefined }) {
  const qc = useQueryClient();
  const reply = useServerFn(replyToIssue);
  const [body, setBody] = useState("");
  const [note, setNote] = useState(issue.resolution_note ?? "");

  const { data: replies } = useQuery({
    queryKey: ["issue-replies", issue.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_replies")
        .select("id, author_id, author_name, is_support, body, created_at")
        .eq("issue_id", issue.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const r = await reply({ data: { issueId: issue.id, body } });
      if (!r.ok) throw new Error(r.error ?? "Couldn't send reply");
      return r;
    },
    onSuccess: (r) => {
      setBody("");
      toast.success(r.emailed ? "Reply sent and emailed to the reporter" : "Reply posted");
      qc.invalidateQueries({ queryKey: ["issue-replies", issue.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async () => {
      if (note.trim().length < 3) throw new Error("Write a short note on how it was fixed");
      const { error } = await supabase
        .from("issue_reports")
        .update({ resolution_note: note.trim(), resolved_at: new Date().toISOString(), resolved_by: userId ?? null, status: "resolved" })
        .eq("id", issue.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as resolved");
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["support-issues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {issue.recommendation && (
        <div className="rounded-xl border border-primary/30 p-3">
          <p className="mb-1 text-xs font-bold uppercase text-primary">AI-recommended next steps</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{issue.recommendation.replace(/\*\*/g, "").replace(/^#+\s*/gm, "")}</p>
        </div>
      )}

      <div className="rounded-xl border border-emerald-500/30 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-emerald-500">
          <CheckCircle2 className="size-3.5" /> Resolution
        </p>
        {issue.resolution_note && !canResolve && (
          <p className="whitespace-pre-wrap text-sm text-foreground">{issue.resolution_note}</p>
        )}
        {issue.resolved_at && <p className="text-xs text-muted-foreground">Confirmed fixed {shortTime(issue.resolved_at)}</p>}
        {!issue.resolution_note && !canResolve && <p className="text-sm text-muted-foreground">Not confirmed fixed yet.</p>}
        {canResolve && (
          <div className="mt-2 space-y-2">
            <Textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What fixed it? e.g. Rider re-delivered at 4pm, customer confirmed." />
            <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate()}>
              <CheckCircle2 className="mr-1.5 size-4" /> {issue.resolution_note ? "Update resolution" : "Confirm fixed"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase text-muted-foreground">Conversation</p>
        {(replies ?? []).length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
        {(replies ?? []).map((r) => (
          <div key={r.id} className={`rounded-xl border p-3 text-sm ${r.is_support ? "border-primary/40 bg-primary/5" : "border-border"}`}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-foreground">
              {r.is_support && <ShieldCheck className="size-3.5 text-primary" />}
              {r.author_name ?? "Team member"} <span className="font-normal text-muted-foreground">· {shortTime(r.created_at)}</span>
            </p>
            <p className="whitespace-pre-wrap text-foreground">{r.body}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={canResolve ? "Reply to the reporter and their managers…" : "Write a reply…"} />
          <Button aria-label="Send reply" title="Send reply" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
