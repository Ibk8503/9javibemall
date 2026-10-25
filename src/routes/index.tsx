import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PackageSearch,
  Truck,
  KeyRound,
  Users,
  ArrowRight,
  Zap,
  Webhook,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "9jaVibeMall Logistics Hub · Partner Console" },
      {
        name: "description",
        content:
          "High-performance multi-partner logistics platform for 9jaVibeMall. Receive live order drops, dispatch riders, and stream signed webhooks.",
      },
      { property: "og:title", content: "9jaVibeMall Logistics Hub · Partner Console" },
      {
        property: "og:description",
        content:
          "Receive live 9jaVibeMall order drops, dispatch riders, and manage your logistics team in one console.",
      },
      { property: "og:url", content: "https://vibe-logistics-hub.lovable.app/" },
      {
        property: "og:image",
        content:
          "https://vibe-logistics-hub.lovable.app/__l5e/assets-v1/25b9c8db-c9cb-4de5-ad19-b04dd71f6587/9javibemall-social.jpg",
      },
      {
        name: "twitter:image",
        content:
          "https://vibe-logistics-hub.lovable.app/__l5e/assets-v1/25b9c8db-c9cb-4de5-ad19-b04dd71f6587/9javibemall-social.jpg",
      },
    ],
    links: [{ rel: "canonical", href: "https://vibe-logistics-hub.lovable.app/" }],
  }),
  component: Landing,
});

const features = [
  {
    icon: PackageSearch,
    title: "Instant Live Drop Feed",
    body: "Incoming 9jaVibeMall orders drop straight into your workspace in real-time. Single-tap acknowledgement.",
    tag: "REALTIME",
  },
  {
    icon: Truck,
    title: "Hyper-Fast Dispatch & Tracking",
    body: "Dispatch riders, update status to out-for-delivery, and log timestamped delivery confirmations.",
    tag: "FLEET OPS",
  },
  {
    icon: Users,
    title: "Granular Team Roles",
    body: "Invite fleet owners, dispatch managers, and delivery riders with strict role-based access control.",
    tag: "RBAC",
  },
  {
    icon: KeyRound,
    title: "Isolated API & SHA-256 Webhooks",
    body: "Multi-tenant data isolation. Each partner receives their own API keys and SHA-256 HMAC signed webhooks.",
    tag: "SECURE API",
  },
];

function Landing() {
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5 font-display text-lg font-bold text-foreground">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#F2751A] text-white shadow-md">
            <Zap className="size-5 font-extrabold fill-current" />
          </div>
          <span>
            9jaVibeMall <span className="text-[#F2751A]">Logistics</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session ? (
            <Button asChild className="neon-brand-btn text-xs font-bold h-9 px-4 rounded-xl">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <Button asChild className="neon-brand-btn text-xs font-bold h-9 px-4 rounded-xl">
              <Link
                to="/auth"
                search={{ redirect: undefined, mode: "signin", email: undefined, role: undefined }}
              >
                Sign In
              </Link>
            </Button>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#F2751A]/40 bg-[#F2751A]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#F2751A] backdrop-blur-md">
          <Sparkles className="size-4 animate-spin text-[#F2751A]" />
          <span>9jaVibeMall Logistics Hub · Fleet Network</span>
        </div>

        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl leading-[1.15]">
          Modern Delivery Operations for <span className="text-[#F2751A]">9jaVibeMall</span>{" "}
          Logistics.
        </h1>

        <p className="mt-6 max-w-2xl text-sm sm:text-lg text-muted-foreground font-normal leading-relaxed">
          The high-velocity console for logistics partners. Receive API order drops, dispatch
          riders, manage team roles, and stream SHA-256 signed webhooks — with 100% partner data
          isolation.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {session ? (
            <Button
              asChild
              size="lg"
              className="neon-brand-btn h-12 px-7 text-sm font-extrabold rounded-xl"
            >
              <Link to="/incoming">
                Open Fleet Workspace <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                size="lg"
                className="neon-brand-btn h-12 px-7 text-sm font-extrabold rounded-xl"
              >
                <Link
                  to="/auth"
                  search={{ redirect: undefined, mode: "signin", email: undefined, role: undefined }}
                >
                  Partner Sign In <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-7 text-sm font-bold rounded-xl border-border bg-card text-foreground hover:bg-muted"
              >
                <Link
                  to="/auth"
                  search={{ redirect: undefined, mode: "signup", email: undefined, role: undefined }}
                >
                  Register Partner Fleet
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <section
              key={f.title}
              className="saas-card relative overflow-hidden p-6 transition-all hover:border-[#F2751A]/50 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/20 group-hover:scale-110 transition-transform">
                  <f.icon className="size-5" />
                </div>
                <span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-[10px] font-extrabold tracking-widest text-muted-foreground">
                  {f.tag}
                </span>
              </div>
              <h2 className="mt-4 font-display text-lg font-extrabold text-foreground">
                {f.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </section>
          ))}
        </div>

        {/* API & Webhooks Banner */}
        <div className="mt-14 saas-card relative overflow-hidden p-8 text-center sm:p-10 border-[#F2751A]/30">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/30">
            <Webhook className="size-6" />
          </div>
          <h3 className="mt-4 font-display text-xl font-extrabold text-foreground">
            REST API & Signed Webhooks Included
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Create orders programmatically via{" "}
            <code className="text-[#F2751A] font-mono font-bold">POST /api/public/orders</code> and
            receive SHA-256 HMAC signed status updates directly into your systems.
          </p>
        </div>
      </div>
    </div>
  );
}
