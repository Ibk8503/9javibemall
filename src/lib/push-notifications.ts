import { supabase } from "@/integrations/supabase/client";

// Firebase web configuration with secure environment fallbacks
export const FIREBASE_WEB_CONFIG = {
  apiKey:
    import.meta.env["VITE_FIREBASE_API_KEY"] || "AIzaSyB2LNHnFHJOBF1PXhurBVKmJrbTvVAIyXk",
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] || "javibemall.firebaseapp.com",
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] || "javibemall",
  storageBucket:
    import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] || "javibemall.firebasestorage.app",
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] || "1022668959518",
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] || "1:1022668959518:web:8b4dc5046eaa07340c230f",
  vapidKey: import.meta.env["VITE_FIREBASE_VAPID_KEY"] || "",
};

const TOKEN_STORAGE_KEY = "vibe_fcm_device_token";

export function getPushPermissionState(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function registerPushNotifications(
  userId: string,
  partnerId: string,
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return { success: false, error: "Web push notifications are not supported in this browser." };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, error: "Notification permission was denied." };
    }

    // Register service worker
    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    let deviceToken = "";

    // Attempt Firebase Web SDK token generation if module available
    try {
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      const { getMessaging, getToken } = await import("firebase/messaging");

      const app = getApps().length === 0 ? initializeApp(FIREBASE_WEB_CONFIG) : getApp();
      const messaging = getMessaging(app);

      const tokenOptions: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string } = {
        serviceWorkerRegistration: swRegistration,
      };

      if (FIREBASE_WEB_CONFIG.vapidKey) {
        tokenOptions.vapidKey = FIREBASE_WEB_CONFIG.vapidKey;
      }

      deviceToken = await getToken(messaging, tokenOptions);
    } catch (fbError) {
      console.warn(
        "[WebPush] Firebase SDK token generation fallback to browser PushSubscription:",
        fbError,
      );

      // Fallback: Standard Web Push Subscription
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: FIREBASE_WEB_CONFIG.vapidKey || undefined,
      });
      deviceToken = JSON.stringify(sub);
    }

    if (!deviceToken) {
      throw new Error("Unable to obtain device push notification token.");
    }

    // Securely register/persist token in Supabase user_device_tokens table
    const { error: dbError } = await supabase.from("user_device_tokens").upsert(
      {
        user_id: userId,
        partner_id: partnerId,
        token: deviceToken,
        device_type: "web",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );

    if (dbError) {
      console.error("[WebPush] Failed to record token in database:", dbError);
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, deviceToken);
    return { success: true, token: deviceToken };
  } catch (err) {
    console.error("[WebPush] Registration error:", err);
    return { success: false, error: (err as Error).message };
  }
}

export async function unregisterPushNotifications(userId?: string): Promise<void> {
  try {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken) {
      if (userId) {
        await supabase.from("user_device_tokens").delete().eq("token", savedToken);
      }
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("[WebPush] Failed to clean up device token on logout:", err);
  }
}
