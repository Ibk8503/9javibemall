-- Full Schema Reset and Fresh Migration Script for 9jaVibeMall Logistics Hub
-- Project URL: https://fcwweppdyepnxdfelofc.supabase.co

-- 0. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 1. DROP EXISTING TABLES AND TYPES FOR A CLEAN RESET
DROP TRIGGER IF EXISTS trg_sync_assigned_rider ON public.orders CASCADE;
DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders CASCADE;

DROP TABLE IF EXISTS public.delivery_events CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.partner_members CASCADE;
DROP TABLE IF EXISTS public.partner_api_credentials CASCADE;
DROP TABLE IF EXISTS public.partners CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.partner_role CASCADE;

-- 2. CREATE ENUM TYPES
CREATE TYPE public.partner_role AS ENUM ('owner', 'manager', 'rider');
CREATE TYPE public.order_status AS ENUM ('pending', 'acknowledged', 'in_transit', 'delivered', 'failed');

-- 3. CREATE TABLES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_api_credentials (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  api_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);
GRANT SELECT ON public.partner_api_credentials TO authenticated;
GRANT ALL ON public.partner_api_credentials TO service_role;
ALTER TABLE public.partner_api_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.partner_role NOT NULL DEFAULT 'rider',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_members TO authenticated;
GRANT ALL ON public.partner_members TO service_role;
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.partner_role NOT NULL DEFAULT 'rider',
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + INTERVAL '14 days',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  order_ref text NOT NULL,
  pickup_address text NOT NULL,
  pickup_contact_name text,
  pickup_contact_phone text,
  dropoff_address text NOT NULL,
  dropoff_contact_name text,
  dropoff_contact_phone text,
  items text,
  status public.order_status NOT NULL DEFAULT 'pending',
  assigned_rider uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  delivered_at timestamptz,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.delivery_events TO authenticated;
GRANT ALL ON public.delivery_events TO service_role;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- 4. HELPER FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.is_partner_member(_partner_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_members m WHERE m.partner_id = _partner_id AND m.user_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) TO authenticated, anon, public, service_role;

CREATE OR REPLACE FUNCTION public.partner_role_of(_partner_id uuid, _user_id uuid)
RETURNS public.partner_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.partner_members m WHERE m.partner_id = _partner_id AND m.user_id = _user_id
$$;
GRANT EXECUTE ON FUNCTION public.partner_role_of(uuid, uuid) TO authenticated, anon, public, service_role;

CREATE OR REPLACE FUNCTION public.is_partner_admin(_partner_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members m
    WHERE m.partner_id = _partner_id AND m.user_id = _user_id AND m.role IN ('owner','manager')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_partner_admin(uuid, uuid) TO authenticated, anon, public, service_role;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_assigned_rider_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_rider IS NOT NULL AND NEW.assigned_rider_id IS NULL THEN
    NEW.assigned_rider_id := NEW.assigned_rider;
  ELSIF NEW.assigned_rider_id IS NOT NULL AND NEW.assigned_rider IS NULL THEN
    NEW.assigned_rider := NEW.assigned_rider_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_sync_assigned_rider
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_assigned_rider_columns();

-- 5. ROW LEVEL SECURITY POLICIES
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "members read partner" ON public.partners FOR SELECT TO authenticated
  USING (public.is_partner_member(id, auth.uid()));
CREATE POLICY "admins update partner" ON public.partners FOR UPDATE TO authenticated
  USING (public.is_partner_admin(id, auth.uid())) WITH CHECK (public.is_partner_admin(id, auth.uid()));

CREATE POLICY "admins read api key" ON public.partner_api_credentials FOR SELECT TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));

CREATE POLICY "members read team" ON public.partner_members FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "admins manage team" ON public.partner_members FOR UPDATE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid())) WITH CHECK (public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "admins remove team" ON public.partner_members FOR DELETE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));

CREATE POLICY "admins read invites" ON public.invitations FOR SELECT TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "admins create invites" ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(partner_id, auth.uid()) AND invited_by = auth.uid());
CREATE POLICY "admins update invites" ON public.invitations FOR UPDATE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "admins delete invites" ON public.invitations FOR DELETE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));

CREATE POLICY "members read orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "admins create orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(partner_id, auth.uid()));
CREATE POLICY "members update orders" ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_partner_admin(partner_id, auth.uid())
    OR (public.is_partner_member(partner_id, auth.uid())
        AND (assigned_rider IS NULL OR assigned_rider = auth.uid() OR assigned_rider_id IS NULL OR assigned_rider_id = auth.uid()))
  )
  WITH CHECK (public.is_partner_member(partner_id, auth.uid()));
CREATE POLICY "admins delete orders" ON public.orders FOR DELETE TO authenticated
  USING (public.is_partner_admin(partner_id, auth.uid()));

CREATE POLICY "members read events" ON public.delivery_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_partner_member(o.partner_id, auth.uid())));
CREATE POLICY "members add events" ON public.delivery_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_partner_member(o.partner_id, auth.uid())));

-- 6. RPC STORED PROCEDURES
CREATE OR REPLACE FUNCTION public.bootstrap_partner(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _pid uuid;
  _code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  BEGIN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
  EXCEPTION WHEN OTHERS THEN
    _email := NULL;
  END;

  IF _email IS NULL OR _email = '' THEN
    _email := coalesce(auth.jwt() ->> 'email', '');
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (_uid, _email, nullif(_name, ''))
  ON CONFLICT (id) DO UPDATE SET 
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(nullif(_name, ''), public.profiles.full_name);

  SELECT partner_id INTO _pid FROM public.partner_members WHERE user_id = _uid LIMIT 1;
  IF _pid IS NOT NULL THEN RETURN _pid; END IF;

  _code := 'SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.partners (name, partner_code)
  VALUES (coalesce(nullif(_name, ''), 'Smart Logistics Partner'), _code)
  RETURNING id INTO _pid;

  INSERT INTO public.partner_api_credentials (partner_id, api_key)
  VALUES (_pid, 'sl_live_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  ON CONFLICT (partner_id) DO NOTHING;

  INSERT INTO public.partner_members (partner_id, user_id, role) 
  VALUES (_pid, _uid, 'owner')
  ON CONFLICT (partner_id, user_id) DO NOTHING;

  RETURN _pid;
END; $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_partner(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _inv public.invitations;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  BEGIN
    SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  EXCEPTION WHEN OTHERS THEN
    _email := NULL;
  END;

  IF _email IS NULL OR _email = '' THEN
    _email := lower(coalesce(auth.jwt() ->> 'email', ''));
  END IF;

  SELECT * INTO _inv FROM public.invitations WHERE token = _token;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation already used'; END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;
  IF lower(_inv.email) <> _email THEN RAISE EXCEPTION 'This invitation was sent to a different email address'; END IF;

  INSERT INTO public.profiles (id, email) VALUES (_uid, _email)
  ON CONFLICT (id) DO UPDATE SET email = excluded.email;

  INSERT INTO public.partner_members (partner_id, user_id, role)
  VALUES (_inv.partner_id, _uid, _inv.role)
  ON CONFLICT (partner_id, user_id) DO UPDATE SET role = excluded.role;

  UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = _inv.id;
  RETURN _inv.partner_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
RETURNS table (partner_name text, email text, role public.partner_role, status text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.name, i.email, i.role, i.status, i.expires_at
  FROM public.invitations i JOIN public.partners p ON p.id = i.partner_id
  WHERE i.token = _token
$$;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rotate_api_key(_partner_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text;
BEGIN
  IF NOT public.is_partner_admin(_partner_id, auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  _key := 'sl_live_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE public.partner_api_credentials SET api_key = _key, rotated_at = now() WHERE partner_id = _partner_id;
  RETURN _key;
END; $$;
GRANT EXECUTE ON FUNCTION public.rotate_api_key(uuid) TO authenticated;
