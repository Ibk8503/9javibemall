import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Loading your workspace…
    </div>
  );
}

interface ErrorStateProps {
  error: Error | null;
}

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="surface-panel p-4 text-sm text-destructive">
      {error?.message || "An error occurred while loading your workspace"}
    </div>
  );
}
