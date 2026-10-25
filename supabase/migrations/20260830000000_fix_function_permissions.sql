-- Fix function execute permissions for RLS helper functions and workspace initialization procedures
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) TO authenticated, anon, public, service_role;
GRANT EXECUTE ON FUNCTION public.is_partner_admin(uuid, uuid) TO authenticated, anon, public, service_role;
GRANT EXECUTE ON FUNCTION public.partner_role_of(uuid, uuid) TO authenticated, anon, public, service_role;

GRANT EXECUTE ON FUNCTION public.bootstrap_partner(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_api_key(uuid) TO authenticated, service_role;

-- Ensure partner_members SELECT policy allows members to view their own records directly
DROP POLICY IF EXISTS "members read team" ON public.partner_members;
CREATE POLICY "members read team" ON public.partner_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_partner_member(partner_id, auth.uid()));

-- Security Definer helper function for Public API order creation (bypasses anon table permission errors safely)
CREATE OR REPLACE FUNCTION public.create_partner_order(
  _partner_id uuid,
  _order_ref text,
  _pickup_address text,
  _pickup_contact_name text DEFAULT NULL,
  _pickup_contact_phone text DEFAULT NULL,
  _dropoff_address text DEFAULT NULL,
  _dropoff_contact_name text DEFAULT NULL,
  _dropoff_contact_phone text DEFAULT NULL,
  _items text DEFAULT NULL,
  _webhook_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_order public.orders%ROWTYPE;
BEGIN
  INSERT INTO public.orders (
    partner_id,
    order_ref,
    pickup_address,
    pickup_contact_name,
    pickup_contact_phone,
    dropoff_address,
    dropoff_contact_name,
    dropoff_contact_phone,
    items,
    status,
    webhook_url
  ) VALUES (
    _partner_id,
    trim(_order_ref),
    trim(_pickup_address),
    nullif(trim(_pickup_contact_name), ''),
    nullif(trim(_pickup_contact_phone), ''),
    trim(_dropoff_address),
    nullif(trim(_dropoff_contact_name), ''),
    nullif(trim(_dropoff_contact_phone), ''),
    nullif(trim(_items), ''),
    'pending',
    nullif(trim(_webhook_url), '')
  )
  RETURNING * INTO _new_order;

  -- Create initial delivery event
  INSERT INTO public.delivery_events (
    order_id,
    status,
    note
  ) VALUES (
    _new_order.id,
    'pending',
    'Order created via Partner API feed'
  );

  RETURN to_jsonb(_new_order);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partner_order(uuid, text, text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;

-- Security Definer helper function for Public API order lookup
CREATE OR REPLACE FUNCTION public.get_partner_order_by_id(
  _partner_id uuid,
  _order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order', to_jsonb(o),
    'delivery_events', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(e))
        FROM public.delivery_events e
        WHERE e.order_id = o.id
      ),
      '[]'::jsonb
    )
  ) INTO _result
  FROM public.orders o
  WHERE o.id = _order_id AND o.partner_id = _partner_id;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_order_by_id(uuid, uuid) TO anon, authenticated, service_role;
