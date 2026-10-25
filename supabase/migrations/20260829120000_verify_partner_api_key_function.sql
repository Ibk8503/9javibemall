-- Security Definer helper function to verify partner API key safely without RLS issues
CREATE OR REPLACE FUNCTION public.verify_partner_api_key(_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
