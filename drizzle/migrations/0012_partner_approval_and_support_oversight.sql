ALTER TABLE public.partners ADD COLUMN approval_status text NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE public.partners ADD COLUMN approved_at timestamptz;
ALTER TABLE public.partners ADD COLUMN approved_by uuid;
UPDATE public.partners SET approval_status = 'approved', approved_at = now();

REVOKE UPDATE ON public.partners FROM authenticated;
GRANT UPDATE (name) ON public.partners TO authenticated;

CREATE OR REPLACE FUNCTION public.set_partner_approval(_partner_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_support(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.partners
    SET approval_status = _status,
        approved_at = CASE WHEN _status = 'approved' THEN now() ELSE NULL END,
        approved_by = auth.uid()
    WHERE id = _partner_id;
END $$;
REVOKE ALL ON FUNCTION public.set_partner_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_partner_approval(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_partner_api_key(_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _partner_id uuid;
BEGIN
  SELECT c.partner_id INTO _partner_id
  FROM public.partner_api_credentials c
  JOIN public.partners p ON p.id = c.partner_id
  WHERE c.api_key = trim(_key) AND p.approval_status = 'approved'
  LIMIT 1;
  RETURN _partner_id;
END;
$function$;

CREATE POLICY "support reads ratings" ON public.delivery_ratings FOR SELECT TO authenticated
  USING (public.is_platform_support(auth.uid()));