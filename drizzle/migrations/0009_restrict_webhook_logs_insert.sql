DROP POLICY IF EXISTS "authenticated users insert webhook logs" ON public.webhook_logs;
CREATE POLICY "partner members insert webhook logs" ON public.webhook_logs
  FOR INSERT TO authenticated
  WITH CHECK (partner_id IS NOT NULL AND public.is_partner_member(partner_id, auth.uid()));