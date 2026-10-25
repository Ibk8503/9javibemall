import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PackageSearch,
  Truck,
  History,
  Users,
  KeyRound,
  LineChart,
  LifeBuoy,
  MapPinned,
} from "lucide-react";
import type { PartnerRole } from "@/lib/partner";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly ownerOnly?: boolean;
  readonly hideFromRider?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incoming", label: "Incoming", icon: PackageSearch },
  { to: "/deliveries", label: "Deliveries", icon: Truck },
  { to: "/my-deliveries", label: "My Deliveries", icon: Truck },
  { to: "/tracking", label: "Tracking", icon: MapPinned, hideFromRider: true },
  { to: "/availability", label: "Availability", icon: Users, hideFromRider: true },

  { to: "/analytics", label: "Analytics", icon: LineChart, hideFromRider: true },
  { to: "/history", label: "History", icon: History },
  { to: "/team", label: "Team", icon: Users },
  { to: "/assist", label: "Issue Help", icon: LifeBuoy },
  { to: "/issues", label: "Issues", icon: LifeBuoy },
  { to: "/credentials", label: "API Keys", icon: KeyRound, ownerOnly: true },
] as const;

interface PartnerNavigationProps {
  userRole?: PartnerRole | undefined;
}

export function PartnerNavigation({ userRole }: PartnerNavigationProps) {
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.ownerOnly && userRole !== "owner") return false;
    if (item.hideFromRider && userRole === "rider") return false;
    return true;
  });

  return (
    <nav className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
      {visibleItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="group flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold tracking-wide uppercase text-slate-400 transition-all duration-200 hover:bg-white/5 hover:text-slate-200 data-[status=active]:bg-primary data-[status=active]:text-slate-950 data-[status=active]:shadow-[0_0_15px_rgba(255,102,0,0.4)]"
          activeProps={{ "data-status": "active" }}
        >
          <item.icon className="size-4 transition-transform group-hover:scale-110" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
