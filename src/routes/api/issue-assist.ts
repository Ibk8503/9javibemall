import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

const Body = z.object({
  description: z.string().trim().min(5).max(2000),
  orderId: z.string().uuid().nullable().optional(),
});

const SYSTEM = `You are a logistics operations assistant for 9jaVibeMall delivery partners in Nigeria.
A manager or rider describes a problem with an order or delivery. Reply in concise Markdown with:
1. **What's likely happening** (1-2 sentences)
2. **Next steps** — a numbered list of 3-6 specific, practical actions they can take now
3. **When to escalate** — one line; escalation contact is support@9javibemall.com.ng
Keep it under 250 words. Prioritise rider safety and customer communication. Never invent order details you weren't given.`;

export const Route = createFileRoute("/api/issue-assist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Please describe the issue (5–2000 characters).", { status: 400 });

        let context = "";
        if (parsed.data.orderId) {
          // RLS restricts this to orders the caller's partner can see.
          const { data: order } = await supabase
            .from("orders")
            .select("order_ref, status, pickup_address, dropoff_address, items, created_at, delivery_events(status, note, created_at)")
            .eq("id", parsed.data.orderId)
            .maybeSingle();
          if (order) context = `\n\nOrder context (JSON): ${JSON.stringify(order)}`;
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured.", { status: 500 });
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        });

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: SYSTEM,
          prompt: `Issue: ${parsed.data.description}${context}`,
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
