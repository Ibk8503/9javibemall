CREATE TABLE public.rider_availability (
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','busy')),
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.rider_availability TO authenticated;
GRANT ALL ON public.rider_availability TO service_role;
ALTER TABLE public.rider_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view availability" ON public.rider_availability FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "Admins set availability" ON public.rider_availability FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(partner_id, auth.uid()) AND public.partner_role_of(partner_id, user_id) = 'rider');
CREATE POLICY "Admins update availability" ON public.rider_availability FOR UPDATE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()))
  WITH CHECK (public.is_partner_admin(partner_id, auth.uid()));
CREATE TRIGGER rider_availability_updated_at BEFORE UPDATE ON public.rider_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_availability;