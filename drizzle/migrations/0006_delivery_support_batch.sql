-- Platform support role (9jaVibeMall staff)
CREATE TABLE public.platform_support (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_support TO authenticated;
GRANT ALL ON public.platform_support TO service_role;
ALTER TABLE public.platform_support ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own support flag" ON public.platform_support FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_support(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_support WHERE user_id = _user_id);
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_support(uuid) TO authenticated;

INSERT INTO public.platform_support (user_id) VALUES ('e1edf993-ef32-45c9-ba4a-20e290b7e4ea') ON CONFLICT DO NOTHING;

-- Team roster with names (members only)
CREATE OR REPLACE FUNCTION public.partner_team(_partner_id uuid)
RETURNS TABLE(user_id uuid, role partner_role, email text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.role, p.email, p.full_name
  FROM public.partner_members m LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.partner_id = _partner_id AND public.is_partner_member(_partner_id, auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.partner_team(uuid) TO authenticated;

-- Issue resolution + support access
ALTER TABLE public.issue_reports
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
CREATE POLICY "support reads all issues" ON public.issue_reports FOR SELECT TO authenticated USING (public.is_platform_support(auth.uid()));
CREATE POLICY "support updates all issues" ON public.issue_reports FOR UPDATE TO authenticated
  USING (public.is_platform_support(auth.uid())) WITH CHECK (public.is_platform_support(auth.uid()));
CREATE POLICY "support reads partners" ON public.partners FOR SELECT TO authenticated USING (public.is_platform_support(auth.uid()));
CREATE POLICY "support reads orders" ON public.orders FOR SELECT TO authenticated USING (public.is_platform_support(auth.uid()));

CREATE TABLE public.issue_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issue_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  is_support boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.issue_replies TO authenticated;
GRANT ALL ON public.issue_replies TO service_role;
ALTER TABLE public.issue_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read replies on visible issues" ON public.issue_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.issue_reports i WHERE i.id = issue_id AND (i.reporter_id = auth.uid() OR public.is_partner_admin(i.partner_id, auth.uid()) OR public.is_platform_support(auth.uid()))));
CREATE POLICY "post replies on visible issues" ON public.issue_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
    AND is_support = public.is_platform_support(auth.uid())
    AND EXISTS (SELECT 1 FROM public.issue_reports i WHERE i.id = issue_id AND (i.reporter_id = auth.uid() OR public.is_partner_admin(i.partner_id, auth.uid()) OR public.is_platform_support(auth.uid()))));
CREATE INDEX issue_replies_issue_idx ON public.issue_replies(issue_id, created_at);

-- Rider live locations
CREATE TABLE public.rider_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rider_locations TO authenticated;
GRANT ALL ON public.rider_locations TO service_role;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riders write own location" ON public.rider_locations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "riders update own location" ON public.rider_locations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "own or admin read locations" ON public.rider_locations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_partner_admin(partner_id, auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_locations;

-- Delivery status / assignment notifications
CREATE OR REPLACE FUNCTION public.notify_delivery_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _label := CASE NEW.status WHEN 'acknowledged' THEN 'acknowledged' WHEN 'in_transit' THEN 'out for delivery'
      WHEN 'delivered' THEN 'delivered' WHEN 'failed' THEN 'marked failed' ELSE NEW.status::text END;
    INSERT INTO public.notifications (user_id, partner_id, type, order_id, title, message)
    SELECT DISTINCT u, NEW.partner_id, 'DELIVERY_STATUS', NEW.id, 'Delivery update',
      'Order ' || NEW.order_ref || ' is now ' || _label
    FROM (
      SELECT pm.user_id AS u FROM public.partner_members pm WHERE pm.partner_id = NEW.partner_id AND pm.role IN ('owner','manager')
      UNION SELECT NEW.assigned_rider_id WHERE NEW.assigned_rider_id IS NOT NULL
    ) t WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
  END IF;
  IF NEW.assigned_rider_id IS DISTINCT FROM OLD.assigned_rider_id AND NEW.assigned_rider_id IS NOT NULL
     AND NEW.assigned_rider_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications (user_id, partner_id, type, order_id, title, message)
    VALUES (NEW.assigned_rider_id, NEW.partner_id, 'DELIVERY_ASSIGNED', NEW.id, 'New delivery assigned',
      'You''ve been assigned order ' || NEW.order_ref || ' — drop-off: ' || NEW.dropoff_address);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_delivery_change AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_change();