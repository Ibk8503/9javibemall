import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type PartnerContext } from "@/lib/partner";

export interface AppNotification {
  id: string;
  user_id: string;
  partner_id: string;
  type: string;
  order_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications(partnerContext?: PartnerContext) {
  const queryClient = useQueryClient();
  const userId = partnerContext?.userId;
  const partnerId = partnerContext?.partnerId;
  const isManagerOrOwner = partnerContext?.role === "owner" || partnerContext?.role === "manager";

  // 1. Fetch user-scoped notifications
  const {
    data: notifications = [],
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    staleTime: 15_000,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // 2. Automated unattended order check (idempotent)
  useEffect(() => {
    if (!partnerId || !isManagerOrOwner) return;

    const runUnattendedCheck = async () => {
      try {
        const { error } = await supabase.rpc("check_unattended_orders", {
          _partner_id: partnerId,
        });
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
        }
      } catch (e) {
        console.warn("[Notifications] Error checking unattended orders:", e);
      }
    };

    // Run on initial load
    void runUnattendedCheck();

    // Re-check periodically every 60 seconds
    const interval = setInterval(runUnattendedCheck, 60_000);
    return () => clearInterval(interval);
  }, [partnerId, isManagerOrOwner, userId, queryClient]);

  // 3. Supabase Realtime subscription for real-time notification alerts
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          const isNewOrder = newNotif.type === "ORDER_NEW";
          const isDelivery = newNotif.type === "DELIVERY_STATUS" || newNotif.type === "DELIVERY_ASSIGNED";
          (isNewOrder ? toast.success : toast.info)(newNotif.title, {
            description: newNotif.message,
            duration: isNewOrder || newNotif.type === "DELIVERY_ASSIGNED" ? 10_000 : 6_000,
          });
          if (
            (isNewOrder || isDelivery) &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            try {
              new Notification(newNotif.title, { body: newNotif.message, icon: "/favicon.png" });
            } catch {
              /* ignore */
            }
          }
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
          if (isNewOrder || isDelivery) {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["incoming"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // 4. Mark single notification as read mutation
  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // 5. Mark all as read mutation
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_all_notifications_read");
      if (error) {
        // Fallback: direct update if RPC fails
        const { error: directError } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId!)
          .eq("is_read", false);
        if (directError) throw directError;
      }
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // 6. Delete notification mutation
  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return {
    notifications,
    unreadCount,
    isPending,
    isError,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
