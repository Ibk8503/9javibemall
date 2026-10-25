-- Fix workspace initialization and invitation acceptance by fetching email reliably from auth.users or auth.jwt()

CREATE OR REPLACE FUNCTION public.bootstrap_partner(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _pid uuid;
  _code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Fetch authenticated user's email directly from auth.users or JWT claims
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

  -- Check if user is already a member of an existing partner workspace
  SELECT partner_id INTO _pid FROM public.partner_members WHERE user_id = _uid LIMIT 1;
  IF _pid IS NOT NULL THEN RETURN _pid; END IF;

  -- Create a new partner workspace for the owner
  _code := 'SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.partners (name, partner_code)
  VALUES (coalesce(nullif(_name, ''), 'Smart Logistics Partner'), _code)
  RETURNING id INTO _pid;

  -- Generate secret API credentials for the new workspace
  INSERT INTO public.partner_api_credentials (partner_id, api_key)
  VALUES (_pid, 'sl_live_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  ON CONFLICT (partner_id) DO NOTHING;

  -- Link user as owner of the new workspace
  INSERT INTO public.partner_members (partner_id, user_id, role) 
  VALUES (_pid, _uid, 'owner')
  ON CONFLICT (partner_id, user_id) DO NOTHING;

  RETURN _pid;
END; $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_partner(text) TO authenticated;

-- Fix accept_invitation to fetch email reliably
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
