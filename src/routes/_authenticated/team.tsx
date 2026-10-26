import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Loader2, Trash2, UserPlus, Users, AlertTriangle, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  usePartnerContext,
  isAdminRole,
  roleLabel,
  shortTime,
  type PartnerRole,
} from "@/lib/partner";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [{ title: "Team & Roles · 9jaVibeMall Logistics" }],
  }),
  component: Team,
});

function Team() {
  const { data: ctx } = usePartnerContext();
  const queryClient = useQueryClient();
  const admin = isAdminRole(ctx?.role);
  const isOwner = ctx?.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PartnerRole>("rider");
  const [expiryDays, setExpiryDays] = useState("7");

  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);

  const canManageMember = (memberRole: PartnerRole, memberUserId: string) => {
    if (memberUserId === ctx?.userId) return false;
    if (isOwner) return true;
    if (ctx?.role === "manager") return memberRole === "rider";
    return false;
  };

  const { data: members, isPending: isMembersPending } = useQuery({
    queryKey: ["members", ctx?.partnerId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_members")
        .select("id, role, user_id, created_at")
        .eq("partner_id", ctx!.partnerId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: invites, isPending: isInvitesPending } = useQuery({
    queryKey: ["invites", ctx?.partnerId],
    enabled: !!ctx && admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("partner_id", ctx!.partnerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Please enter a valid email address");
      if (isOwner && role === "owner") {
        throw new Error("Owners can invite managers and riders only");
      }
      const safeRole: PartnerRole = isOwner ? role : "rider";
      const { data, error } = await supabase
        .from("invitations")
        .insert({
          partner_id: ctx!.partnerId,
          email: email.trim().toLowerCase(),
          role: safeRole,
          invited_by: ctx!.userId,
          expires_at: new Date(Date.now() + Number(expiryDays) * 86400000).toISOString(),
        })
        .select("token")
        .single();
      if (error) throw error;
      return data.token;
    },
    onSuccess: async (token) => {
      const link = `${window.location.origin}/invite?token=${token}`;
      const copied = await copyText(link, "Invitation link");
      if (!copied) toast.success("Invitation created — use Copy Link button to share");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: PartnerRole }) => {
      const { error } = await supabase.from("partner_members").update({ role: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member role updated!");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed from fleet workspace.");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase
        .from("invitations")
        .update({
          token,
          status: "pending",
          expires_at: new Date(Date.now() + Number(expiryDays) * 86400000).toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
      return token;
    },
    onSuccess: async (token) => {
      const copied = await copyText(`${window.location.origin}/invite?token=${token}`, "Invitation link");
      if (!copied) toast.success(`Invitation renewed for ${expiryDays} days`);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      toast.success("Invitation revoked!");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            <Users className="size-7 text-[#F2751A]" />
            Team & Role Management
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Manage owners, managers, and riders for{" "}
            <span className="font-bold text-foreground">{ctx?.partnerName}</span>.
          </p>
        </div>
      </div>

      {admin && (
        <section className="saas-card p-6 border-[#F2751A]/30">
          <h2 className="font-display text-base font-extrabold text-foreground">
            Invite Team Member
          </h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-email"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Email Address
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rider@logistics.com"
                className="bg-card border-border text-foreground h-11 text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-role"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Assigned Role
              </Label>
              {isOwner ? (
                <Select value={role} onValueChange={(v) => setRole(v as PartnerRole)}>
                  <SelectTrigger
                    id="invite-role"
                    className="w-full sm:w-36 h-11 bg-card border-border text-foreground text-xs font-bold"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="rider">Rider</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-11 w-full items-center rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-muted-foreground sm:w-36">
                  Rider
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-expiry"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Link Expires In
              </Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger
                  id="invite-expiry"
                  className="w-full sm:w-32 h-11 bg-card border-border text-foreground text-xs font-bold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              className="neon-brand-btn h-11 px-6 font-extrabold text-xs rounded-xl"
              disabled={invite.isPending}
            >
              {invite.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-4" />
              )}
              Send Invitation
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            {isOwner
              ? "Owners can invite managers and riders. The invitation link is copied automatically."
              : "As a manager, you can invite riders to join the fleet."}
          </p>
        </section>
      )}

      {/* Active Team Members */}
      <section className="space-y-4">
        <h2 className="font-display text-sm font-extrabold text-foreground">
          Active Fleet Members
        </h2>
        {isMembersPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl bg-muted" />
            <Skeleton className="h-16 w-full rounded-2xl bg-muted" />
          </div>
        ) : (
          <div className="space-y-3">
            {members?.map((member) => {
              const manageable = canManageMember(member.role as PartnerRole, member.user_id);
              const isSelf = member.user_id === ctx?.userId;
              return (
                <div
                  key={member.id}
                  className="saas-card flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/30">
                      <UserCheck className="size-5" />
                    </div>
                    <div>
                      <p className="font-bold text-xs sm:text-sm text-foreground">
                        {isSelf
                          ? `${ctx.email} (You)`
                          : `Member (${member.user_id.slice(0, 8)}...)`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Joined {shortTime(member.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {manageable ? (
                      <>
                        {isOwner ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) =>
                              changeRole.mutate({ id: member.id, next: v as PartnerRole })
                            }
                          >
                            <SelectTrigger className="w-36 h-9 bg-card border-border text-foreground text-xs font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="rider">Rider</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="rounded-full bg-muted border border-border px-3 py-1 text-xs font-extrabold text-foreground">
                            {roleLabel[member.role as PartnerRole]}
                          </span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          onClick={() => setRemoveTargetId(member.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="rounded-full bg-muted border border-border px-3 py-1 text-xs font-extrabold text-foreground">
                        {roleLabel[member.role as PartnerRole]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Invitation Status Panel */}
      {admin && (
        <section className="space-y-4">
          <h2 className="font-display text-sm font-extrabold text-foreground">
            Invitation Status
          </h2>
          {!isInvitesPending && !!invites?.length && (
            <div className="grid grid-cols-4 gap-2">
              {(["pending", "accepted", "expired", "revoked"] as const).map((s) => (
                <div key={s} className="saas-card p-3 text-center">
                  <p className="font-display text-lg font-extrabold text-foreground">
                    {invites.filter((i) => inviteState(i) === s).length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s}</p>
                </div>
              ))}
            </div>
          )}
          {isInvitesPending ? (
            <Skeleton className="h-16 w-full rounded-2xl bg-muted" />
          ) : !invites?.length ? (
            <div className="saas-card p-8 text-center text-xs text-muted-foreground">
              No invitations yet. Create one using the form above.
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map((inv) => {
                const state = inviteState(inv);
                return (
                <div
                  key={inv.id}
                  className="saas-card flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-xs sm:text-sm text-foreground">
                      {inv.email}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {roleLabel[inv.role as PartnerRole]} ·{" "}
                      <span
                        className={
                          state === "accepted"
                            ? "font-bold text-primary"
                            : state === "pending"
                              ? "font-bold text-foreground"
                              : "font-bold text-destructive"
                        }
                      >
                        {state === "accepted" ? "Accepted" : state === "pending" ? "Pending" : state === "expired" ? "Expired" : "Revoked"}
                      </span>{" "}
                      ·{" "}
                      {state === "accepted" && inv.accepted_at
                        ? `Joined ${shortTime(inv.accepted_at)}`
                        : `Expires ${shortTime(inv.expires_at)}`}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {(state === "pending" || state === "expired") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border bg-card text-xs font-bold text-foreground hover:bg-muted"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(inv.id)}
                      >
                        <Copy className="mr-1.5 size-3.5" /> Resend
                      </Button>
                    )}
                    {(state === "pending" || (state === "expired" && isOwner)) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 text-xs font-bold"
                        onClick={() => setRevokeTargetId(inv.id)}
                      >
                        {state === "expired" ? "Invalidate" : "Revoke"}
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Dialog Modals */}
      <AlertDialog
        open={!!removeTargetId}
        onOpenChange={(open) => !open && setRemoveTargetId(null)}
      >
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500 font-display">
              <AlertTriangle className="size-5" /> Remove Team Member
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Are you sure you want to remove this member from your fleet workspace? They will lose
              access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs"
              onClick={() => {
                if (removeTargetId) {
                  removeMember.mutate(removeTargetId);
                  setRemoveTargetId(null);
                }
              }}
            >
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!revokeTargetId}
        onOpenChange={(open) => !open && setRevokeTargetId(null)}
      >
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500 font-display">
              <AlertTriangle className="size-5" /> Revoke Workspace Invitation
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Are you sure you want to revoke this invitation? The recipient will no longer be able
              to join using the link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs"
              onClick={() => {
                if (revokeTargetId) {
                  revoke.mutate(revokeTargetId);
                  setRevokeTargetId(null);
                }
              }}
            >
              Confirm Revocation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function inviteState(inv: { status: string; expires_at: string }) {
  if (inv.status === "accepted") return "accepted" as const;
  if (inv.status === "revoked") return "revoked" as const;
  if (new Date(inv.expires_at).getTime() < Date.now()) return "expired" as const;
  return "pending" as const;
}
