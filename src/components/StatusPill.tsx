import { cn } from "@/lib/utils";
import { statusLabel, type OrderStatus } from "@/lib/partner";

const styles: Record<OrderStatus, { container: string; dot: string }> = {
  pending: {
    container: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400 animate-pulse",
  },
  acknowledged: {
    container: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500 dark:bg-sky-400",
  },
  in_transit: {
    container: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400 animate-pulse",
  },
  delivered: {
    container: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  failed: {
    container: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
  },
};

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const current = styles[status] || styles.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide uppercase whitespace-nowrap transition-all",
        current.container,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full shrink-0", current.dot)} />
      {statusLabel[status] || status}
    </span>
  );
}
