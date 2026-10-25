CREATE TABLE public.support_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  reply_to text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.issue_reports(id) ON DELETE SET NULL,
  order_ref text,
  partner_name text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  body_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_emails_created_at_idx ON public.support_emails (created_at DESC);

GRANT SELECT ON public.support_emails TO authenticated;
GRANT ALL ON public.support_emails TO service_role;

ALTER TABLE public.support_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support staff read email log"
ON public.support_emails FOR SELECT TO authenticated
USING (public.is_platform_support(auth.uid()));
