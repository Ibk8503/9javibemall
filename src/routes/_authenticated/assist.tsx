import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LifeBuoy, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { emailIssueToSupport } from "@/lib/issue-email.functions";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext } from "@/lib/partner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/assist")({
  head: () => ({
    meta: [
      { title: "Issue Assistant · 9jaVibeMall Logistics" },
      { name: "description", content: "Describe an order or delivery problem and get recommended next steps." },
    ],
  }),
  component: AssistPage,
});

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderLine(line: string, i: number) {
  const safe = escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return <p key={i} className="min-h-[0.75rem]" dangerouslySetInnerHTML={{ __html: safe.replace(/^#+\s*/, "") }} />;
}

function AssistPage() {
  const { data: ctx } = usePartnerContext();
  const emailSupport = useServerFn(emailIssueToSupport);
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: orders } = useQuery({
    queryKey: ["orders", "assist", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_ref, status")
        .eq("partner_id", ctx!.partnerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  async function submit() {
    if (description.trim().length < 5) {
      toast.error("Describe the issue in a bit more detail.");
      return;
    }
    setBusy(true);
    setAnswer("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/issue-assist", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ description, orderId: orderId || null }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(
          res.status === 429 ? "Too many requests — please wait a moment." :
          res.status === 402 ? "AI credits have run out. Ask the workspace owner to top up." :
          msg || "Couldn't get recommendations.",
        );
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        full += chunk;
        setAnswer((a) => a + chunk);
      }
      if (ctx) {
        const { data: saved, error: saveErr } = await supabase
          .from("issue_reports")
          .insert({
            partner_id: ctx.partnerId,
            reporter_id: ctx.userId,
            order_id: orderId || null,
            description: description.trim(),
            recommendation: full,
          })
          .select("id")
          .single();
        if (saveErr) toast.error("Couldn't save this report: " + saveErr.message);
        else {
          const mail = await emailSupport({ data: { issueId: saved.id } }).catch(() => ({ sent: false }));
          toast.success(mail.sent ? "Report saved and sent to support" : "Report saved to Issues");
          if (!mail.sent) toast.warning("Support couldn't be emailed automatically — email support@9javibemall.com.ng if urgent.");
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
          <LifeBuoy className="size-7 text-primary" /> Issue Assistant
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what's going wrong with an order or delivery and get recommended next steps.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Related order (optional)</span>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">No specific order</option>
            {(orders ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.order_ref} · {o.status}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">What happened?</span>
          <Textarea
            autoFocus
            rows={5}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Customer isn't picking up calls and the gate is locked at the drop-off address."
          />
        </label>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {busy ? "Thinking…" : "Get next steps"}
          </Button>
          {busy && (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              <Square className="mr-2 size-4" /> Stop
            </Button>
          )}
        </div>
      </div>

      {(answer || busy) && (
        <div className="space-y-1 rounded-2xl border border-primary/30 bg-card p-5 text-sm leading-relaxed text-foreground">
          {answer ? answer.split("\n").map(renderLine) : <p className="text-muted-foreground">Working out next steps…</p>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Suggestions are AI-generated — use your judgement. Still stuck? Email{" "}
        <a className="text-primary underline" href="mailto:support@9javibemall.com.ng">support@9javibemall.com.ng</a>.
      </p>
    </div>
  );
}
