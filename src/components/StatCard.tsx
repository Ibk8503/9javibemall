import React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  borderColor?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg,
  iconColor,
  borderColor,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "saas-card flex flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-0.5",
        borderColor,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div
          className={cn("flex size-11 items-center justify-center rounded-2xl shrink-0", iconBg)}
        >
          <Icon className={cn("size-5 font-bold", iconColor)} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        {subtitle && <span className="font-medium text-muted-foreground">{subtitle}</span>}
        {trend && (
          <span
            className={cn(
              "font-bold font-mono px-2 py-0.5 rounded-full text-[11px]",
              trend.isPositive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
