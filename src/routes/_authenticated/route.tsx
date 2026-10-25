import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { usePartnerContext } from "@/lib/partner";
import { AppShell } from "@/components/AppShell";
import { LoadingState, ErrorState } from "@/components/layout-states";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: undefined, mode: undefined, email: undefined, role: undefined },
      });
    }
    return { user: data.user };
  },
  component: PartnerLayout,
});

function PartnerLayout() {
  const { data: ctx, isPending, error } = usePartnerContext();
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({
      to: "/auth",
      search: { redirect: undefined, mode: undefined, email: undefined, role: undefined },
      replace: true,
    });
  };

  return (
    <AppShell partnerContext={ctx} onSignOut={handleSignOut}>
      {isPending && <LoadingState />}
      {error && <ErrorState error={error} />}
      {!isPending && !error && <Outlet />}
    </AppShell>
  );
}
