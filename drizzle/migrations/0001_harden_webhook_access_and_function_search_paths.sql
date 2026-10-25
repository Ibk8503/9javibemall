-- Keep delivery history append-only: explicit deny policies document the intended invariant.
DROP POLICY IF EXISTS "delivery events deny updates" ON public.delivery_events;
CREATE POLICY "delivery events deny updates" ON public.delivery_events
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "delivery events deny deletes" ON public.delivery_events;
CREATE POLICY "delivery events deny deletes" ON public.delivery_events
  FOR DELETE TO authenticated
  USING (false);

-- Keep invitation token validation behind the narrowly scoped, security-definer preview RPC.
DROP POLICY IF EXISTS "public invitation token preview" ON public.invitations;
CREATE POLICY "public invitation token preview" ON public.invitations
  FOR SELECT TO anon
  USING (false);

-- Partner members can read order operational data, but not stored webhook destinations.
-- The application now requests an explicit non-secret column list for member views.
REVOKE SELECT (webhook_url) ON public.orders FROM authenticated;

-- The API verifier is security-definer and must have a fixed search path.
CREATE OR REPLACE FUNCTION public.verify_partner_api_key(_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _partner_id uuid;
BEGIN
  SELECT partner_id INTO _partner_id
  FROM public.partner_api_credentials
  WHERE api_key = trim(_key)
  LIMIT 1;

  RETURN _partner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_partner_api_key(text) TO anon, authenticated, service_role;