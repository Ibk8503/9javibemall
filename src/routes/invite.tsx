import { sendWelcomeEmail } from "@/lib/app-emails.functions";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MailCheck, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { roleLabel, shortTime, type PartnerRole } from "@/lib/partner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/invite")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? (search["token"] as string) : "",
  }),
  head: () => ({
    meta: [{ title: "Accept Invitation · 9jaVibeMall Logistics Hub" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  const {
    data: preview,
    isPending,
    error,
  } = useQuery({
    queryKey: ["invite-preview", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("invitation_preview", { _token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("accept_invitation", { _token: token });
      if (error) throw error;
      void sendWelcomeEmail().catch(() => {});
    },
    onSuccess: () => {
      toast.success("Invitation accepted — welcome to the fleet!");
      navigate({ to: "/incoming", replace: true });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const isExpired = preview ? new Date(preview.expires_at) < new Date() : false;
  const isAccepted = preview?.status === "accepted";
  const isRevoked = preview?.status === "revoked";
  const isValid = preview?.status === "pending" && !isExpired;

  return (
    <div className="hero-glow flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-display text-lg font-bold text-slate-100 hover:opacity-90"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_12px_rgba(255,102,0,0.4)]">
              <Zap className="size-4" />
            </div>
            <span>9jaVibeMall Logistics</span>
          </Link>
        </div>

        <div className="surface-panel p-7 border-primary/20 shadow-2xl">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/30 shadow-[0_0_20px_rgba(255,102,0,0.25)]">
            <MailCheck className="size-7" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-extrabold text-slate-100">
            Workspace Invitation
          </h1>

          {!token ? (
            <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400 flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Missing Invitation Token</p>
                <p className="mt-1 text-xs text-red-400/80">
                  This invitation URL is missing a valid token parameter.
                </p>
              </div>
            </div>
          ) : isPending ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-4 w-3/4 bg-slate-800" />
              <Skeleton className="h-4 w-1/2 bg-slate-800" />
              <Skeleton className="h-12 w-full rounded-xl bg-slate-800" />
            </div>
          ) : error || !preview ? (
            <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400 flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Invitation Not Found</p>
                <p className="mt-1 text-xs text-red-400/80">
                  We couldn't verify this invitation. It may have expired or been deleted.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Fleet Workspace
                </p>
                <p className="mt-1 font-display text-xl font-extrabold text-slate-100">
                  {preview.partner_name}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-xs">
                  <span className="text-slate-400">Invited User:</span>
                  <span className="font-semibold text-slate-200">{preview.email}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Assigned Role:</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/30 px-3 py-0.5 text-xs font-extrabold text-primary">
                    {roleLabel[preview.role as PartnerRole] || preview.role}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-primary" /> Expires:{" "}
                  {shortTime(preview.expires_at)}
                </div>
              </div>

              {isAccepted && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-400 flex items-center gap-3">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <div>
                    <p className="font-bold">Already Accepted</p>
                    <p className="text-xs text-emerald-400/80">
                      This invitation has already been used. Sign in to access workspace.
                    </p>
                  </div>
                </div>
              )}

              {isRevoked && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400 flex items-center gap-3">
                  <AlertTriangle className="size-5 shrink-0" />
                  <div>
                    <p className="font-bold">Invitation Revoked</p>
                    <p className="text-xs text-red-400/80">
                      This invite was revoked by workspace admin.
                    </p>
                  </div>
                </div>
              )}

              {isExpired && !isAccepted && !isRevoked && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-400 flex items-center gap-3">
                  <Clock className="size-5 shrink-0" />
                  <div>
                    <p className="font-bold">Invitation Expired</p>
                    <p className="text-xs text-amber-400/80">
                      This invitation link has expired. Request a new invite from your admin.
                    </p>
                  </div>
                </div>
              )}

              {isValid && session ? (
                (() => {
                  const currentEmail = session.user.email?.toLowerCase().trim();
                  const invitedEmail = preview.email?.toLowerCase().trim();
                  const emailsMatch = currentEmail === invitedEmail;

                  if (!emailsMatch) {
                    return (
                      <div className="space-y-4 pt-2">
                        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-xs text-red-400 space-y-2">
                          <div className="flex items-center gap-2 font-bold text-sm text-red-400">
                            <AlertTriangle className="size-4 shrink-0" />
                            Email Mismatch Detected
                          </div>
                          <p>
                            You are currently signed in as{" "}
                            <span className="font-bold text-slate-100">{session.user.email}</span>,
                            but this invitation was issued specifically to{" "}
                            <span className="font-bold text-slate-100">{preview.email}</span>.
                          </p>
                          <p className="text-[11px] text-red-400/80">
                            For security against token hijacking, invitations can only be accepted
                            by the original invited email address.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-11 border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 text-xs font-bold"
                          onClick={async () => {
                            await supabase.auth.signOut();
                            window.location.reload();
                          }}
                        >
                          Sign Out & Switch Account
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <Button
                      className="neon-btn w-full h-12 text-sm font-extrabold rounded-xl"
                      onClick={() => accept.mutate()}
                      disabled={accept.isPending}
                    >
                      {accept.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Accept & Join Fleet
                    </Button>
                  );
                })()
              ) : isValid && !session ? (
                <div className="space-y-3 pt-2">
                  <Button
                    asChild
                    className="neon-btn w-full h-12 text-sm font-extrabold rounded-xl"
                  >
                    <Link
                      to="/auth"
                      search={{
                        redirect: `/invite?token=${token}`,
                        mode: "signup",
                        email: preview.email,
                        role: preview.role,
                      }}
                    >
                      Set Up Account & Join
                    </Link>
                  </Button>
                  <p className="text-center text-xs text-slate-400">
                    Already have an account?{" "}
                    <Link
                      to="/auth"
                      search={{
                        redirect: `/invite?token=${token}`,
                        mode: "signin",
                        email: preview.email,
                        role: preview.role,
                      }}
                      className="font-bold text-primary hover:underline"
                    >
                      Sign in to accept
                    </Link>
                  </p>
                </div>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="w-full h-11 border-slate-800 bg-slate-900/60 text-slate-300"
                >
                  <Link to="/">Back to Home</Link>
                </Button>
              )}
            </div>
          )}

          <p className="mt-5 border-t border-slate-800 pt-4 text-center text-[11px] text-slate-400">
            Stuck setting up? Contact{" "}
            <a
              href="mailto:support@9javibemall.com.ng"
              className="font-bold text-primary hover:underline"
            >
              support@9javibemall.com.ng
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
