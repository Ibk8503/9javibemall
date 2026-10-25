CREATE TYPE public.issue_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TABLE public.issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  description text NOT NULL,
  recommendation text,
  status public.issue_status NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issue_reports TO authenticated;
GRANT ALL ON public.issue_reports TO service_role;
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members create own issues" ON public.issue_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "read own or admin issues" ON public.issue_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "update own or admin issues" ON public.issue_reports FOR UPDATE TO authenticated
  USING (reporter_id = auth.uid() OR public.is_partner_admin(partner_id, auth.uid()))
  WITH CHECK (public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "delete own issues" ON public.issue_reports FOR DELETE TO authenticated
  USING (reporter_id = auth.uid());
CREATE INDEX issue_reports_partner_idx ON public.issue_reports(partner_id, created_at DESC);
CREATE TRIGGER issue_reports_updated_at BEFORE UPDATE ON public.issue_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();