-- Security & Notification Upgrade Migration Script for 9jaVibeMall Logistics Hub
-- Project URL: https://fcwweppdyepnxdfelofc.supabase.co

-- 1. CREATE NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  type text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_order_type 
  ON public.notifications (order_id, type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
CREATE POLICY "users read own notifications" ON public.notifications 
  FOR SELECT TO authenticated 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
CREATE POLICY "users update own notifications" ON public.notifications 
  FOR UPDATE TO authenticated 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users delete own notifications" ON public.notifications;
CREATE POLICY "users delete own notifications" ON public.notifications 
  FOR DELETE TO authenticated 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins insert notifications" ON public.notifications;
CREATE POLICY "admins insert notifications" ON public.notifications 
  FOR INSERT TO authenticated 
  WITH CHECK (public.is_partner_admin(partner_id, auth.uid()) OR user_id = auth.uid());


-- 2. CREATE USER DEVICE TOKENS TABLE (FOR WEB PUSH / FCM)
CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  device_type text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user 
  ON public.user_device_tokens (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_device_tokens TO authenticated;
GRANT ALL ON public.user_device_tokens TO service_role;
ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own tokens" ON public.user_device_tokens;
CREATE POLICY "users read own tokens" ON public.user_device_tokens 
  FOR SELECT TO authenticated 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users manage own tokens" ON public.user_device_tokens;
CREATE POLICY "users manage own tokens" ON public.user_device_tokens 
  FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own tokens" ON public.user_device_tokens;
CREATE POLICY "users update own tokens" ON public.user_device_tokens 
  FOR UPDATE TO authenticated 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users delete own tokens" ON public.user_device_tokens;
CREATE POLICY "users delete own tokens" ON public.user_device_tokens 
  FOR DELETE TO authenticated 
  USING (user_id = auth.uid());


-- 3. HARDEN INVITATION ACCEPTANCE RPC
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _inv public.invitations;
BEGIN
  IF _uid IS NULL THEN 
    RAISE EXCEPTION 'Not authenticated'; 
  END IF;

  -- Extract authenticated user email reliably
  BEGIN
    SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  EXCEPTION WHEN OTHERS THEN
    _email := NULL;
  END;

  IF _email IS NULL OR _email = '' THEN
    _email := lower(coalesce(auth.jwt() ->> 'email', ''));
  END IF;

  IF _email IS NULL OR _email = '' THEN
    RAISE EXCEPTION 'Unable to verify email address for authenticated user';
  END IF;

  -- Validate invitation record
  SELECT * INTO _inv FROM public.invitations WHERE token = _token;
  
  IF _inv.id IS NULL THEN 
    RAISE EXCEPTION 'Invitation not found or token is invalid'; 
  END IF;
  
  IF _inv.status = 'revoked' THEN 
    RAISE EXCEPTION 'This invitation has been revoked by the workspace administrator'; 
  END IF;

  IF _inv.status <> 'pending' THEN 
    RAISE EXCEPTION 'This invitation has already been accepted and used'; 
  END IF;
  
  IF _inv.expires_at < now() THEN 
    RAISE EXCEPTION 'This invitation has expired'; 
  END IF;

  -- Cryptographic and strict email binding enforcement
  IF lower(trim(_inv.email)) <> lower(trim(_email)) THEN 
    RAISE EXCEPTION 'This invitation was sent to % and cannot be accepted with %', _inv.email, _email; 
  END IF;

  -- Synchronize profile
  INSERT INTO public.profiles (id, email) VALUES (_uid, _email)
  ON CONFLICT (id) DO UPDATE SET email = excluded.email;

  -- Bind member strictly to the immutable partner and role from invitation record
  INSERT INTO public.partner_members (partner_id, user_id, role)
  VALUES (_inv.partner_id, _uid, _inv.role)
  ON CONFLICT (partner_id, user_id) DO UPDATE SET role = excluded.role;

  -- Mark invitation as accepted (single-use consumption)
  UPDATE public.invitations 
  SET status = 'accepted', accepted_at = now() 
  WHERE id = _inv.id;

  RETURN _inv.partner_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;


-- 4. UNATTENDED ORDER DETECTION & NOTIFICATION RPC
CREATE OR REPLACE FUNCTION public.check_unattended_orders(_partner_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order record;
  _admin record;
  _notification_count integer := 0;
BEGIN
  -- Select all pending, unacknowledged orders created at least 1 hour ago
  -- that have NOT yet had an ORDER_UNACKNOWLEDGED notification generated.
  FOR _order IN
    SELECT o.id, o.order_ref, o.partner_id, o.created_at
    FROM public.orders o
    WHERE o.status = 'pending'
      AND o.acknowledged_at IS NULL
      AND o.created_at <= (now() - INTERVAL '1 hour')
      AND (_partner_id IS NULL OR o.partner_id = _partner_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.order_id = o.id AND n.type = 'ORDER_UNACKNOWLEDGED'
      )
  LOOP
    -- For each unattended order, notify all owners and managers of that partner
    FOR _admin IN
      SELECT pm.user_id
      FROM public.partner_members pm
      WHERE pm.partner_id = _order.partner_id
        AND pm.role IN ('owner', 'manager')
    LOOP
      INSERT INTO public.notifications (
        user_id,
        partner_id,
        type,
        order_id,
        title,
        message,
        is_read,
        created_at
      ) VALUES (
        _admin.user_id,
        _order.partner_id,
        'ORDER_UNACKNOWLEDGED',
        _order.id,
        'Unattended order',
        'Order ' || _order.order_ref || ' has been waiting for acknowledgement for over 1 hour.',
        false,
        now()
      );
      _notification_count := _notification_count + 1;
    END LOOP;
  END LOOP;

  RETURN _notification_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.check_unattended_orders(uuid) TO authenticated, service_role;


-- 5. NOTIFICATION READ RPCs
CREATE OR REPLACE FUNCTION public.mark_notification_read(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE id = _id AND user_id = auth.uid();
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid() AND is_read = false;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
