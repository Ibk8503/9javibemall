import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

async function run(request: Request) {
  const cronSecret = process.env["CRON_SECRET"];
  const authHeader = request.headers.get("Authorization") || "";
  // Fail closed: the job only runs when a secret is configured and presented exactly.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data, error } = await supabase.rpc("check_unattended_orders");
    if (error) {
      console.error("check_unattended_orders failed", error);
      return Response.json({ error: "Job failed" }, { status: 500 });
    }
    return Response.json({
      success: true,
      notificationsCreated: data ?? 0,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("unattended cron error", err);
    return Response.json({ error: "Job failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/Cron/Unattended")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});
