import React from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="saas-card flex flex-col items-center justify-center p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-[#F2751A]/10 text-[#F2751A] border border-[#F2751A]/20 shadow-[0_0_20px_rgba(242,117,26,0.2)]">
        <Icon className="size-7" />
      </div>
      <h3 className="mt-4 font-display text-lg font-extrabold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          className="neon-brand-btn mt-5 px-5 h-10 font-extrabold text-xs rounded-xl"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
