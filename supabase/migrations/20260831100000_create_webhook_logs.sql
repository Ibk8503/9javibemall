-- Webhook Logs Schema for vibe-logistics-hub
-- Logs every outgoing webhook dispatch attempt with payload, signature, response code, and latency

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_ref text,
  webhook_url text NOT NULL,
  event text NOT NULL,
  request_headers jsonb,
  request_payload jsonb NOT NULL,
  signature text,
  response_status integer,
  response_body text,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_partner 
  ON public.webhook_logs (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_order 
  ON public.webhook_logs (order_id);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at 
  ON public.webhook_logs (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner members view webhook logs" ON public.webhook_logs;
CREATE POLICY "partner members view webhook logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (
    partner_id IS NULL OR partner_id IN (
      SELECT pm.partner_id FROM public.partner_members pm WHERE pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "authenticated users insert webhook logs" ON public.webhook_logs;
CREATE POLICY "authenticated users insert webhook logs" ON public.webhook_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "partner admins delete webhook logs" ON public.webhook_logs;
CREATE POLICY "partner admins delete webhook logs" ON public.webhook_logs
  FOR DELETE TO authenticated
  USING (
    partner_id IS NULL OR partner_id IN (
      SELECT pm.partner_id FROM public.partner_members pm 
      WHERE pm.user_id = auth.uid() AND pm.role IN ('owner', 'manager')
    )
  );
