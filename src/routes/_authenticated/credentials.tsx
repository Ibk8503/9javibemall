import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Webhook,
  Code2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext, roleLabel, shortTime } from "@/lib/partner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/credentials")({
  head: () => ({
    meta: [{ title: "API Credentials & Webhooks · 9jaVibeMall Logistics" }],
  }),
  component: Credentials,
});

function copy(value: string, label: string) {
  void navigator.clipboard?.writeText(value);
  toast.success(`${label} copied to clipboard!`);
}

function Credentials() {
  const { data: ctx } = usePartnerContext();
  const queryClient = useQueryClient();
  const isOwner = ctx?.role === "owner";
  const [revealed, setRevealed] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);

  const { data: creds, isPending } = useQuery({
    queryKey: ["credentials", ctx?.partnerId],
    enabled: !!ctx && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_api_credentials")
        .select("api_key, created_at, rotated_at")
        .eq("partner_id", ctx!.partnerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("rotate_api_key", { _partner_id: ctx!.partnerId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("API key rotated successfully — update your API clients!");
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const masked = creds?.api_key ? `${creds.api_key.slice(0, 11)}${"•".repeat(24)}` : "";
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://logistics.9javibemall.com.ng";

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <KeyRound className="size-7 text-[#F2751A]" />
            API Credentials & Documentation
          </h1>
        </div>
        <section className="saas-card flex items-start gap-4 p-6 border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="mt-0.5 size-6 text-amber-500 shrink-0" />
          <div>
            <h2 className="font-display text-base font-bold text-foreground">
              Owner Restricted Access
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Secret API keys are restricted to the partner Owner account (
              {roleLabel[ctx?.role ?? "rider"]} access). Contact your fleet owner if you require
              integration access.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <KeyRound className="size-7 text-[#F2751A]" />
            API Keys & Webhook Integration
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Manage developer keys and webhooks for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span>.
          </p>
        </div>
      </div>

      {/* Partner ID Card */}
      <section className="saas-card space-y-3 p-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Logistics Partner ID Code
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <code className="font-display text-xl font-extrabold text-[#F2751A] rounded-xl bg-muted px-4 py-2 border border-border">
            {ctx?.partnerCode}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="h-9 border-border bg-card text-foreground font-bold text-xs"
            onClick={() => copy(ctx?.partnerCode ?? "", "Partner ID")}
          >
            <Copy className="mr-1.5 size-3.5" /> Copy ID
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Unique fleet tenant code for your workspace.
        </p>
      </section>

      {/* Secret API Key Card */}
      <section className="saas-card space-y-5 p-6 border-[#F2751A]/30">
        <div className="flex items-center gap-2.5">
          <KeyRound className="size-6 text-[#F2751A]" />
          <h2 className="font-display text-lg font-extrabold text-foreground">
            Secret Live API Key
          </h2>
        </div>

        {isPending ? (
          <Skeleton className="h-14 w-full rounded-xl bg-muted" />
        ) : (
          <div className="space-y-4">
            <code className="block overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs font-mono font-bold text-slate-100 border border-slate-800 shadow-inner">
              {revealed ? creds?.api_key : masked}
            </code>

            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-border bg-card text-foreground font-bold text-xs"
                onClick={() => setRevealed(!revealed)}
              >
                {revealed ? (
                  <EyeOff className="mr-1.5 size-3.5" />
                ) : (
                  <Eye className="mr-1.5 size-3.5" />
                )}
                {revealed ? "Hide Secret" : "Reveal Secret"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-border bg-card text-foreground font-bold text-xs"
                onClick={() => copy(creds?.api_key ?? "", "API key")}
              >
                <Copy className="mr-1.5 size-3.5" /> Copy Secret
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9 font-bold text-xs rounded-xl"
                onClick={() => setShowRotateDialog(true)}
                disabled={rotate.isPending}
              >
                <RefreshCw className="mr-1.5 size-3.5" /> Rotate Key
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Key created {shortTime(creds?.created_at ?? null)}
              {creds?.rotated_at ? ` · Last rotated ${shortTime(creds.rotated_at)}` : ""}. Keep
              secret key safe.
            </p>
          </div>
        )}
      </section>

      {/* API Documentation */}
      <section className="saas-card space-y-6 p-6 sm:p-7">
        <div>
          <h2 className="flex items-center gap-2.5 font-display text-lg font-extrabold text-foreground">
            <Code2 className="size-5 text-[#F2751A]" /> REST API Documentation
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Push order drops, query status, and verify SHA-256 HMAC webhook signatures.
          </p>
        </div>

        {/* POST /orders endpoint doc */}
        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              POST
            </span>
            <code className="font-mono text-sm font-extrabold text-foreground">
              /api/public/orders
            </code>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Creates a new delivery order. Strictly associated with your partner fleet derived from
            your <code className="text-[#F2751A] font-mono font-bold">x-api-key</code>.
          </p>

          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed font-mono text-slate-200 border border-slate-800">
            {`curl -X POST ${origin}/api/public/orders \\
  -H "content-type: application/json" \\
  -H "x-api-key: ${creds?.api_key || "YOUR_SECRET_API_KEY"}" \\
  -d '{
    "order_ref": "9VM-10250",
    "pickup_address": "9jaVibeMall Hub, Ikeja, Lagos",
    "pickup_contact_name": "Hub Dispatch Manager",
    "pickup_contact_phone": "+2348011223344",
    "dropoff_address": "14 Adeniyi Jones Ave, Ikeja, Lagos",
    "dropoff_contact_name": "Adaeze Okonkwo",
    "dropoff_contact_phone": "+2348031122334",
    "items": "1x Bluetooth Speaker",
    "webhook_url": "https://api.yourstore.com/webhooks/logistics"
  }'`}
          </pre>
        </div>

        {/* GET /orders/:id endpoint doc */}
        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-sky-500/20 border border-sky-500/40 px-3 py-1 text-xs font-extrabold text-sky-600 dark:text-sky-400">
              GET
            </span>
            <code className="font-mono text-sm font-extrabold text-foreground">
              /api/public/orders/:id
            </code>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Retrieves order details and audit timeline events. Strictly verifies partner ownership;
            returns <code className="text-red-500 font-mono font-bold">404 Not Found</code> if the
            order belongs to another partner.
          </p>

          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed font-mono text-slate-200 border border-slate-800">
            {`curl -X GET ${origin}/api/public/orders/ORDER_UUID \\
  -H "x-api-key: ${creds?.api_key || "YOUR_SECRET_API_KEY"}"`}
          </pre>
        </div>

        {/* Webhooks Documentation */}
        <div className="space-y-5 rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-2.5">
            <Webhook className="size-5 text-[#F2751A]" />
            <h3 className="font-display text-base font-extrabold text-foreground">
              Webhook Notifications & Payload Specification
            </h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Webhooks are dispatched strictly for{" "}
            <code className="text-purple-500 font-mono font-bold">out_for_delivery</code> and{" "}
            <code className="text-emerald-500 font-mono font-bold">delivered</code> status transitions.
            An asynchronous <code className="font-mono font-bold text-foreground">POST</code> HTTP request is automatically dispatched to your specified{" "}
            <code className="text-[#F2751A] font-mono">webhook_url</code>.
          </p>

          <div className="space-y-2 text-xs">
            <p className="font-bold text-foreground">Webhook HTTP Request Headers:</p>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed font-mono text-slate-200 border border-slate-800">
              {`POST /your-webhook-endpoint HTTP/1.1
Content-Type: application/json
X-Webhook-Signature: <SHA-256 hex signature of raw JSON body>
User-Agent: 9jaVibeMall-Logistics-Webhook/1.0`}
            </pre>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-bold text-foreground">Webhook JSON Request Body:</p>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed font-mono text-emerald-400 border border-slate-800">
              {`{
  "order_id": "8f7e2a1b-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
  "status": "out_for_delivery | delivered"
}`}
            </pre>
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
            <strong>Signature Verification:</strong> Verify incoming webhooks by calculating the SHA-256 digest of the request body string and comparing it against the <code className="font-mono font-bold">X-Webhook-Signature</code> header.
          </div>
        </div>
      </section>

      {/* Rotate Key Dialog */}
      <AlertDialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500 font-display">
              <AlertTriangle className="size-5" /> Confirm API Key Rotation
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Are you sure you want to rotate your secret API key? The previous key will stop
              working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs"
              onClick={() => {
                rotate.mutate();
                setShowRotateDialog(false);
              }}
            >
              Confirm Key Rotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
