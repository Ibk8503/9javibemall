import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Star } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { shortTime } from "@/lib/partner";
import { useIsSupport } from "@/lib/support";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/oversight")({
  head: () => ({
    meta: [
      { title: "Platform Oversight · 9jaVibeMall Logistics" },
      { name: "description", content: "Approve partner businesses, view every delivery and review rider ratings." },
      { property: "og:title", content: "Platform Oversight · 9jaVibeMall Logistics" },
      { property: "og:description", content: "Approve partner businesses, view every delivery and review rider ratings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Oversight,
});

type Tab = "partners" | "deliveries" | "ratings" | "admins";
const TAB_LABEL: Record<Tab, string> = {
  partners: "Partner approvals", deliveries: "All deliveries", ratings: "Rider ratings", admins: "Platform admins",
};

function Oversight() {
  const { data: isSupport, isLoading } = useIsSupport();
  const [tab, setTab] = useState<Tab>("partners");
  if (isLoading) return null;
  if (!isSupport) {
    return <EmptyState icon={ShieldCheck} title="Platform account only" description="This page is only for the 9jaVibeMall platform account." />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Oversight</h1>
        <p className="text-sm text-muted-foreground">Approve partner businesses, track every delivery and see rider ratings.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["partners", "deliveries", "ratings", "admins"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </Button>
        ))}
      </div>
      {tab === "partners" && <Partners />}
      {tab === "deliveries" && <Deliveries />}
      {tab === "ratings" && <Ratings />}
      {tab === "admins" && <Admins />}
    </div>
  );
}

function Admins() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const { data } = useQuery({
    queryKey: ["platform-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_platform_admins");
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_platform_admin", { _email: email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admin added — they can now open Support Desk, Oversight and Partners Monitor");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("remove_platform_admin", { _user_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admin removed");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Admins can use Support Desk, Oversight and Partners Monitor. The person must already have an account — ask them to sign up first.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}
      >
        <Input type="email" required placeholder="admin@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
        <Button type="submit" disabled={add.isPending}>Add admin</Button>
      </form>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {(data ?? []).map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-semibold text-foreground">{a.full_name || a.email || "Unnamed"}</p>
              <p className="text-xs text-muted-foreground">{a.email} · added {shortTime(a.created_at)}</p>
            </div>
            {a.user_id === me ? (
              <span className="text-xs text-muted-foreground">You</span>
            ) : (
              <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(a.user_id)}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function usePartnerNames() {
  return useQuery({
    queryKey: ["oversight-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, partner_code, approval_status, approved_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function Partners() {
  const qc = useQueryClient();
  const { data } = usePartnerNames();
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => {
      const { error } = await supabase.rpc("set_partner_approval", { _partner_id: id, _status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner updated");
      qc.invalidateQueries({ queryKey: ["oversight-partners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const list = data ?? [];
  const pending = list.filter((p) => p.approval_status === "pending").length;
  return (
    <section className="space-y-2">
      <p className="text-sm text-muted-foreground">{pending} waiting for approval · {list.length} total</p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-semibold text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.partner_code} · joined {shortTime(p.created_at)} ·{" "}
                <span className={p.approval_status === "approved" ? "text-primary" : p.approval_status === "rejected" ? "text-destructive" : "text-foreground"}>
                  {p.approval_status === "approved" ? "Approved" : p.approval_status === "rejected" ? "Rejected" : "Pending"}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={setStatus.isPending || p.approval_status === "approved"}
                onClick={() => setStatus.mutate({ id: p.id, status: "approved" })}>Approve</Button>
              <Button size="sm" variant="outline" disabled={setStatus.isPending || p.approval_status === "rejected"}
                onClick={() => setStatus.mutate({ id: p.id, status: "rejected" })}>Reject</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS: Record<string, string> = {
  pending: "Pending", acknowledged: "Acknowledged", in_transit: "Out for delivery", delivered: "Delivered", failed: "Failed",
};

function useProfiles() {
  return useQuery({
    queryKey: ["oversight-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return new Map(data.map((p) => [p.id, p.full_name || p.email || "Rider"]));
    },
  });
}

function Deliveries() {
  const [filter, setFilter] = useState<string>("all");
  const { data: partners } = usePartnerNames();
  const { data: names } = useProfiles();
  const { data } = useQuery({
    queryKey: ["oversight-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, partner_id, order_ref, dropoff_address, status, assigned_rider_id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
  const pName = (id: string) => partners?.find((p) => p.id === id)?.name ?? "—";
  const list = (data ?? []).filter((o) => filter === "all" || o.status === filter);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "acknowledged", "in_transit", "delivered", "failed"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s === "all" ? "All" : STATUS[s]}
          </Button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No deliveries.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((o) => (
            <li key={o.id} className="p-3">
              <p className="font-semibold text-foreground">#{o.order_ref} <span className="text-xs font-normal text-muted-foreground">· {pName(o.partner_id)}</span></p>
              <p className="text-sm text-muted-foreground">{o.dropoff_address}</p>
              <p className="text-xs text-primary">
                {STATUS[o.status] ?? o.status} · {o.assigned_rider_id ? names?.get(o.assigned_rider_id) ?? "Rider" : "Unassigned"} · {shortTime(o.updated_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ratings() {
  const { data: partners } = usePartnerNames();
  const { data: names } = useProfiles();
  const { data } = useQuery({
    queryKey: ["oversight-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_ratings")
        .select("id, partner_id, rider_id, rating, comment, created_at, orders(order_ref)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const list = data ?? [];
  const byRider = new Map<string, { sum: number; n: number; partner: string }>();
  for (const r of list) {
    const cur = byRider.get(r.rider_id) ?? { sum: 0, n: 0, partner: r.partner_id };
    cur.sum += r.rating; cur.n += 1;
    byRider.set(r.rider_id, cur);
  }
  const pName = (id: string) => partners?.find((p) => p.id === id)?.name ?? "—";
  if (list.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No ratings yet. Riders rate completed deliveries from their Rider App.</p>;
  }
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {[...byRider.entries()].map(([id, v]) => (
          <li key={id} className="flex items-center justify-between p-3">
            <div>
              <p className="font-semibold text-foreground">{names?.get(id) ?? "Rider"}</p>
              <p className="text-xs text-muted-foreground">{pName(v.partner)} · {v.n} rating{v.n > 1 ? "s" : ""}</p>
            </div>
            <p className="flex items-center gap-1 font-semibold text-primary"><Star className="size-4 fill-primary" />{(v.sum / v.n).toFixed(1)}</p>
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {list.map((r) => (
          <li key={r.id} className="p-3">
            <p className="text-sm text-foreground">
              {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {names?.get(r.rider_id) ?? "Rider"} · #{r.orders?.order_ref ?? "—"}
            </p>
            {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
            <p className="text-xs text-muted-foreground">{shortTime(r.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
