import React, { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PackageSearch,
  Truck,
  LineChart,
  History,
  Users,
  KeyRound,
  Zap,
  Search,
  Bell,
  Menu,
  LogOut,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  CheckCircle2,
  CheckCheck,
  Volume2,
  Package,
  Trash2,
  Clock,
  Loader2,
  AlertTriangle,
  Webhook,
  MapPinned,
} from "lucide-react";
import { useIsSupport } from "@/lib/support";
import { toast } from "sonner";

import { roleLabel, type PartnerContext, type PartnerRole } from "@/lib/partner";
import { useNotifications } from "@/hooks/use-notifications";
import {
  registerPushNotifications,
  getPushPermissionState,
  unregisterPushNotifications,
} from "@/lib/push-notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

function formatRelativeTime(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

interface AppShellProps {
  children: React.ReactNode;
  partnerContext?: PartnerContext | undefined;
  onSignOut: () => void;
}

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly ownerOnly?: boolean;
  readonly hideFromRider?: boolean;
  readonly supportOnly?: boolean;
  readonly riderOnly?: boolean;
}

const OPERATIONS_NAV: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incoming", label: "Incoming", icon: PackageSearch },
  { to: "/deliveries", label: "Deliveries", icon: Truck },
  { to: "/rider", label: "Rider App", icon: Truck, riderOnly: true },
  { to: "/my-deliveries", label: "My Deliveries", icon: Clock },
  { to: "/tracking", label: "Tracking", icon: MapPinned, hideFromRider: true },
  { to: "/availability", label: "Availability", icon: MapPinned, hideFromRider: true },
  { to: "/analytics", label: "Analytics", icon: LineChart, hideFromRider: true },
  { to: "/history", label: "History", icon: History },
  { to: "/assist", label: "Issue Help", icon: AlertTriangle },
  { to: "/issues", label: "Issues", icon: Package },
] as const;

const MANAGEMENT_NAV: readonly NavItem[] = [
  { to: "/support", label: "Support Desk", icon: ShieldCheck, supportOnly: true },
  { to: "/oversight", label: "Oversight", icon: ShieldCheck, supportOnly: true },
  { to: "/partners-monitor", label: "Partners Monitor", icon: ShieldCheck, supportOnly: true },
  { to: "/team", label: "Team", icon: Users },
  { to: "/credentials", label: "API Keys", icon: KeyRound, ownerOnly: true },
  { to: "/webhooks", label: "Webhook Logs", icon: Webhook, hideFromRider: true },
] as const;

export function AppShell({ children, partnerContext, onSignOut }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissPushBanner, setDismissPushBanner] = useState(false);
  const [pushRegistering, setPushRegistering] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>("default");

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const {
    notifications,
    unreadCount,
    isPending: isNotificationsPending,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications(partnerContext);

  useEffect(() => {
    setPushPermission(getPushPermissionState());
  }, []);

  const handleSignOut = async () => {
    await unregisterPushNotifications(partnerContext?.userId);
    onSignOut();
  };

  const role = partnerContext?.role as PartnerRole | undefined;
  const { data: isSupport } = useIsSupport();

  const filterNav = (items: readonly NavItem[]) =>
    items.filter((item) => {
      if (item.ownerOnly && role !== "owner") return false;
      if (item.hideFromRider && role === "rider") return false;
      if (item.supportOnly && !isSupport) return false;
      if (item.riderOnly && role !== "rider") return false;
      return true;
    });

  const opsNav = filterNav(OPERATIONS_NAV);
  const mgmtNav = filterNav(MANAGEMENT_NAV);

  const navLinkClass = (to: string) => {
    const isActive = currentPath === to;
    return `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
      isActive
        ? "bg-[#F2751A] text-white shadow-[0_4px_12px_rgba(242,117,26,0.35)] font-bold"
        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
    }`;
  };

  const SidebarContent = (
    <div className="flex h-full min-h-0 flex-col justify-between gap-4 bg-[#0B0F19] text-slate-300 p-4 select-none">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
        {/* Sidebar Logo Header */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#F2751A] text-white shadow-[0_0_15px_rgba(242,117,26,0.4)] shrink-0">
            <Zap className="size-5 font-extrabold fill-current" />
          </div>
          {!collapsed && (
            <div>
              <p className="font-display text-base font-extrabold tracking-tight text-white leading-tight">
                9jaVibeMall
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#F2751A]">
                Logistics Hub
              </p>
            </div>
          )}
        </div>

        {/* Secondary Card: Active Logged-in Partner Workspace */}
        {partnerContext && !collapsed && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 shadow-sm space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Active Partner
            </p>
            <p className="truncate text-xs font-extrabold text-white">
              {partnerContext.partnerName}
            </p>
            <div className="flex items-center justify-between pt-0.5">
              <span className="inline-flex items-center rounded-full bg-[#F2751A]/20 border border-[#F2751A]/40 px-2 py-0.5 text-[10px] font-extrabold text-[#F2751A] uppercase">
                {roleLabel[partnerContext.role]}
              </span>
              <span className="font-mono text-[10px] text-slate-500 font-bold">
                {partnerContext.partnerCode}
              </span>
            </div>
          </div>
        )}

        {/* Operations Navigation */}
        <div className="space-y-1 pt-1">
          {!collapsed && (
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Operations
            </p>
          )}
          {opsNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={navLinkClass(item.to)}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="size-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* Management Navigation */}
        {mgmtNav.length > 0 && (
          <div className="space-y-1 pt-2">
            {!collapsed && (
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Management
              </p>
            )}
            {mgmtNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={navLinkClass(item.to)}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="size-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="space-y-4 pt-4 border-t border-slate-800/80">
        {!collapsed && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
            <div className="mx-auto flex size-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
              <HelpCircle className="size-5" />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-200">Need Support?</p>
            <p className="text-[11px] text-slate-400">Get technical assistance</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full h-8 text-xs font-bold border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              onClick={() => window.open("mailto:support@9javibemall.com.ng")}
            >
              Contact Support
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
          {!collapsed && <span>© 2026 Stellaris Nova Techsoft</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex size-7 items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-300 border-r border-slate-800/80 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header Navigation */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/90 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 flex-1 min-w-0 max-w-md">
            {/* Mobile Drawer Trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
                  <Menu className="size-5" />
                  <span className="sr-only">Toggle navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-r border-slate-800 bg-[#0B0F19]">
                {SidebarContent}
              </SheetContent>
            </Sheet>

            {/* Global Search Bar */}
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search orders, customers, addresses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs bg-muted/50 border-border focus:border-primary rounded-xl"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Light / Dark Mode Toggle */}
            <ThemeToggle />

            {/* Notifications Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-9 rounded-full hover:bg-muted"
                  aria-label="Notifications"
                >
                  <Bell className="size-4 text-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-[#F2751A] px-1 text-[9px] font-extrabold text-white ring-2 ring-background animate-in zoom-in-50">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 sm:w-96 p-0 shadow-xl border-border bg-card">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border p-3.5 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-extrabold text-sm text-foreground">Notifications</p>
                    {unreadCount > 0 ? (
                      <span className="text-[10px] font-extrabold text-white bg-[#F2751A] px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Caught up
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] font-bold text-[#F2751A] hover:text-[#F2751A] hover:bg-[#F2751A]/10"
                      onClick={() => markAllAsRead.mutate()}
                      disabled={markAllAsRead.isPending}
                    >
                      <CheckCheck className="mr-1 size-3.5" />
                      Mark all as read
                    </Button>
                  )}
                </div>

                {/* Web Push Permission Banner (if not already granted/denied) */}
                {pushPermission === "default" && !dismissPushBanner && (
                  <div className="border-b border-border bg-[#F2751A]/5 p-3 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <Volume2 className="size-4 text-[#F2751A] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-foreground">Enable Browser Notifications</p>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                          Get immediate desktop & mobile alerts for unattended orders.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="neon-brand-btn h-7 px-3 text-[10px] font-extrabold rounded-lg"
                        disabled={pushRegistering}
                        onClick={async () => {
                          if (!partnerContext) return;
                          setPushRegistering(true);
                          const res = await registerPushNotifications(
                            partnerContext.userId,
                            partnerContext.partnerId,
                          );
                          setPushRegistering(false);
                          if (res.success) {
                            toast.success("Browser notifications enabled!");
                            setPushPermission("granted");
                          } else {
                            toast.error(res.error || "Failed to enable notifications");
                            setPushPermission(getPushPermissionState());
                          }
                        }}
                      >
                        {pushRegistering ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                        Enable Alerts
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                        onClick={() => setDismissPushBanner(true)}
                      >
                        Not now
                      </Button>
                    </div>
                  </div>
                )}

                {/* Notifications Scroll List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
                  {isNotificationsPending ? (
                    <div className="p-4 space-y-3">
                      <div className="h-12 w-full animate-pulse bg-muted rounded-lg" />
                      <div className="h-12 w-full animate-pulse bg-muted rounded-lg" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Bell className="size-5 opacity-40" />
                      </div>
                      <p className="font-bold text-xs text-foreground">You're all caught up</p>
                      <p className="text-[11px] text-muted-foreground">
                        No new notifications right now.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isUnread = !notif.is_read;
                      const isUnattended = notif.type === "ORDER_UNACKNOWLEDGED";

                      return (
                        <div
                          key={notif.id}
                          className={`p-3.5 transition-colors flex items-start justify-between gap-3 ${
                            isUnread ? "bg-[#F2751A]/5 hover:bg-[#F2751A]/10" : "hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div
                              className={`flex size-7 items-center justify-center rounded-lg shrink-0 mt-0.5 ${
                                isUnattended
                                  ? "bg-red-500/10 text-red-500 border border-red-500/20"
                                  : "bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/20"
                              }`}
                            >
                              {isUnattended ? (
                                <AlertTriangle className="size-3.5" />
                              ) : (
                                <Package className="size-3.5" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-xs text-foreground truncate">
                                  {notif.title}
                                </p>
                                {isUnread && (
                                  <span className="size-1.5 rounded-full bg-[#F2751A] shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                                {notif.message}
                              </p>
                              <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {formatRelativeTime(notif.created_at)}
                                </span>
                                {isUnattended && (
                                  <Link
                                    to="/incoming"
                                    className="font-bold text-[#F2751A] hover:underline inline-flex items-center gap-0.5"
                                  >
                                    View incoming <ChevronRight className="size-3" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isUnread && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 text-muted-foreground hover:text-[#F2751A] hover:bg-[#F2751A]/10"
                                title="Mark as read"
                                onClick={() => markAsRead.mutate(notif.id)}
                              >
                                <CheckCircle2 className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                              title="Delete notification"
                              onClick={() => deleteNotification.mutate(notif.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* User / Partner Profile Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2.5 h-10 px-3 rounded-xl border-border bg-card hover:bg-muted text-foreground transition-all shadow-sm"
                >
                  <Avatar className="size-7 border border-[#F2751A]/40 shrink-0">
                    <AvatarFallback className="bg-[#F2751A] text-white font-extrabold text-xs">
                      {(partnerContext?.partnerName || partnerContext?.email || "P")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-left min-w-0 max-w-[120px] sm:max-w-[180px]">
                    <p className="text-xs font-bold leading-tight truncate text-foreground">
                      {partnerContext?.partnerName ?? "Loading Partner..."}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate font-medium">
                      {partnerContext?.email ?? partnerContext?.partnerCode ?? "Account Profile"}
                    </p>
                  </div>
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="p-2">
                  <p className="font-extrabold text-sm text-foreground truncate">
                    {partnerContext?.partnerName ?? "Logistics Partner"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {partnerContext?.email ?? "User Account"}
                  </p>
                  {partnerContext && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-[#F2751A]/10 border border-[#F2751A]/30 px-2 py-0.5 text-[10px] font-extrabold text-[#F2751A] uppercase">
                        {roleLabel[partnerContext.role]}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground font-bold">
                        {partnerContext.partnerCode}
                      </span>
                    </div>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer font-medium text-xs">
                  <Link to="/team">
                    <Users className="mr-2 size-4 text-[#F2751A]" /> Fleet Team
                  </Link>
                </DropdownMenuItem>
                {(!partnerContext || partnerContext.role === "owner") && (
                  <DropdownMenuItem asChild className="cursor-pointer font-medium text-xs">
                    <Link to="/credentials">
                      <KeyRound className="mr-2 size-4 text-[#F2751A]" /> API Credentials
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-red-500 focus:text-red-500 cursor-pointer font-bold text-xs"
                >
                  <LogOut className="mr-2 size-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
