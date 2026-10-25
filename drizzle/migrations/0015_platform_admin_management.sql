CREATE OR REPLACE FUNCTION public.list_platform_admins()
RETURNS TABLE(user_id uuid, email text, full_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_support(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT ps.user_id, p.email, p.full_name, ps.created_at
    FROM public.platform_support ps LEFT JOIN public.profiles p ON p.id = ps.user_id
    ORDER BY ps.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.add_platform_admin(_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.is_platform_support(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'No account uses this email yet. Ask them to sign up first, then add them.'; END IF;
  INSERT INTO public.platform_support(user_id) VALUES (_uid) ON CONFLICT DO NOTHING;
  RETURN _uid;
END $$;

CREATE OR REPLACE FUNCTION public.remove_platform_admin(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_support(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself.'; END IF;
  DELETE FROM public.platform_support WHERE user_id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.list_platform_admins() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_platform_admin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_platform_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(uuid) TO authenticated;