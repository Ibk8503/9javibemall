import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Eye, EyeOff, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
    mode:
      search["mode"] === "signup"
        ? ("signup" as const)
        : search["mode"] === "signin"
          ? ("signin" as const)
          : undefined,
    email: typeof search["email"] === "string" ? (search["email"] as string) : undefined,
    role: typeof search["role"] === "string" ? (search["role"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Partner Sign In · 9jaVibeMall Logistics Hub" },
      { name: "description", content: "Access your 9jaVibeMall Logistics Hub partner console." },
      { property: "og:title", content: "Partner Sign In · 9jaVibeMall Logistics Hub" },
      {
        property: "og:description",
        content: "Sign in to your 9jaVibeMall Logistics Hub partner console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safePath(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/incoming";
}

function AuthPage() {
  const { redirect, mode: modeParam, email: emailParam } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(modeParam ?? "signin");
  const [email, setEmail] = useState(emailParam ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const target = safePath(redirect);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const pendingRedirect = sessionStorage.getItem("google_auth_redirect");
        if (pendingRedirect) sessionStorage.removeItem("google_auth_redirect");
        navigate({ to: safePath(pendingRedirect ?? undefined) || target, replace: true });
      }
    });
  }, [navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: company.trim() || fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created! Check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
        toast.success("Welcome aboard! Workspace initialized.");
        navigate({ to: target, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully.");
        navigate({ to: target, replace: true });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      sessionStorage.setItem("google_auth_redirect", target);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        sessionStorage.removeItem("google_auth_redirect");
        toast.error(result.error.message || "Google sign-in failed. Please try again.");
        setGoogleBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: target, replace: true });
    } catch (err) {
      sessionStorage.removeItem("google_auth_redirect");
      toast.error(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6">
      <div className="flex justify-end p-2">
        <ThemeToggle />
      </div>

      <div className="mx-auto w-full max-w-md my-auto">
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold text-foreground hover:opacity-90"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#F2751A] text-white shadow-md">
              <Zap className="size-5 font-extrabold fill-current" />
            </div>
            <span>
              9jaVibeMall <span className="text-[#F2751A]">Logistics</span>
            </span>
          </Link>
          <h1 className="mt-6 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {mode === "signin" ? "Partner Sign In" : "Register Fleet"}
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {mode === "signin"
              ? "Access your fleet console & live delivery drops."
              : "Set up a new logistics partner workspace."}
          </p>
        </div>

        <form onSubmit={submit} className="saas-card mt-8 space-y-4 p-6 sm:p-7 border-border">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label
                  htmlFor="company"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Company / Fleet Name
                </Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Swift Haulage Ltd"
                  className="bg-card border-border text-foreground h-11 text-xs"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="name"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Your Full Name
                </Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ada Obi"
                  className="bg-card border-border text-foreground h-11 text-xs"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="email"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Email Address
              </Label>
              {emailParam && (
                <span className="text-[10px] font-bold text-[#F2751A] bg-[#F2751A]/10 px-2 py-0.5 rounded-md">
                  Bound to Invitation
                </span>
              )}
            </div>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                if (!emailParam) setEmail(e.target.value);
              }}
              readOnly={!!emailParam}
              placeholder="partner@logistics.com"
              className={`bg-card border-border text-foreground h-11 text-xs ${
                emailParam ? "cursor-not-allowed opacity-90 font-medium" : ""
              }`}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Password
              </Label>
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={async () => {
                    if (!email) { toast.error("Enter your email above first."); return; }
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) toast.error(error.message);
                    else toast.success("Check your email for a link to reset your password.");
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                placeholder="••••••••"
                required
                className="bg-card border-border text-foreground h-11 text-xs pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="neon-brand-btn w-full h-11 text-xs font-extrabold rounded-xl"
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {mode === "signin" ? "Sign In to Console" : "Initialize Workspace"}
          </Button>

          <div className="relative my-2 text-center text-xs">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <span className="relative bg-card px-3 text-muted-foreground">or continue with</span>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 border-border bg-card text-foreground hover:bg-muted text-xs font-bold"
            onClick={google}
            disabled={googleBusy}
          >
            {googleBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {googleBusy ? "Connecting…" : "Continue with Google"}
          </Button>

          <div className="pt-2 text-center">
            <button
              type="button"
              className="text-xs font-bold text-[#F2751A] hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? "Don't have a partner workspace? Register your fleet"
                : "Already registered? Sign in here"}
            </button>
          </div>
        </form>
      </div>

      <div className="py-4 space-y-1.5 text-center">
        <p className="text-[11px] text-muted-foreground">
          Stuck or need help?{" "}
          <a
            href="mailto:support@9javibemall.com.ng"
            className="font-bold text-[#F2751A] hover:underline"
          >
            support@9javibemall.com.ng
          </a>
        </p>
        <p className="text-[11px] text-muted-foreground">
          © 2026 9jaVibeMall Logistics Hub. All rights reserved.
        </p>
      </div>
    </div>
  );
}
