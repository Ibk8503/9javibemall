import { LogOut, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roleLabel, type PartnerContext } from "@/lib/partner";
import { PartnerNavigation } from "./partner-navigation";

interface PartnerHeaderProps {
  partnerContext?: PartnerContext;
  onSignOut: () => void;
}

export function PartnerHeader({ partnerContext, onSignOut }: PartnerHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-orange-600 text-primary-foreground shadow-[0_0_15px_rgba(255,102,0,0.4)] shrink-0">
            <Zap className="size-5 font-bold" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
              9jaVibeMall{" "}
              <span className="text-primary text-xs font-semibold uppercase tracking-wider rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5">
                Logistics Hub
              </span>
            </p>
            {partnerContext && (
              <p className="truncate text-xs text-slate-400">
                <span className="font-semibold text-slate-200">{partnerContext.partnerName}</span> ·{" "}
                <span className="text-primary font-medium">{roleLabel[partnerContext.role]}</span>
              </p>
            )}
          </div>
        </div>

        <Button
          size="sm"
          onClick={onSignOut}
          variant="outline"
          className="shrink-0 border-white/10 bg-slate-900/60 text-slate-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition-all"
        >
          <LogOut className="mr-1.5 size-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-6">
        <PartnerNavigation userRole={partnerContext?.role} />
      </div>
    </header>
  );
}
