-- Add webhook_url column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS webhook_url text;

-- Update bootstrap_partner stored procedure to remove dummy order insertions
CREATE OR REPLACE FUNCTION public.bootstrap_partner(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '');
  _pid uuid;
  _code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (_uid, _email, nullif(_name, ''))
  ON CONFLICT (id) DO UPDATE SET email = excluded.email;

  SELECT partner_id INTO _pid FROM public.partner_members WHERE user_id = _uid LIMIT 1;
  IF _pid IS NOT NULL THEN RETURN _pid; END IF;

  _code := 'SL-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  INSERT INTO public.partners (name, partner_code)
  VALUES (coalesce(nullif(_name, ''), 'Smart Logistics Partner'), _code)
  RETURNING id INTO _pid;

  INSERT INTO public.partner_api_credentials (partner_id, api_key)
  VALUES (_pid, 'sl_live_' || encode(gen_random_bytes(24), 'hex'));

  INSERT INTO public.partner_members (partner_id, user_id, role) VALUES (_pid, _uid, 'owner');

  -- No mock/dummy order insertions. Newly created partners start with clean, empty tables.

  RETURN _pid;
END; $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_partner(text) TO authenticated;
