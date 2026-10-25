CREATE POLICY "Riders set own availability" ON public.rider_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.partner_role_of(partner_id, auth.uid()) = 'rider'::partner_role);
CREATE POLICY "Riders update own availability" ON public.rider_availability FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.partner_role_of(partner_id, auth.uid()) = 'rider'::partner_role)
  WITH CHECK (user_id = auth.uid() AND public.partner_role_of(partner_id, auth.uid()) = 'rider'::partner_role);

CREATE TABLE public.delivery_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rider_id)
);
GRANT SELECT, INSERT, UPDATE ON public.delivery_ratings TO authenticated;
GRANT ALL ON public.delivery_ratings TO service_role;
ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Riders read own ratings, admins read team" ON public.delivery_ratings FOR SELECT TO authenticated
  USING ((rider_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid())) OR public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "Riders rate own completed deliveries" ON public.delivery_ratings FOR INSERT TO authenticated
  WITH CHECK (rider_id = auth.uid() AND public.partner_role_of(partner_id, auth.uid()) = 'rider'::partner_role
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.partner_id = delivery_ratings.partner_id
      AND o.assigned_rider_id = auth.uid() AND o.status IN ('delivered','failed')));
CREATE POLICY "Riders update own ratings" ON public.delivery_ratings FOR UPDATE TO authenticated
  USING (rider_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()))
  WITH CHECK (rider_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()));