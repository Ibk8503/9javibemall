CREATE POLICY "support reads profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_support(auth.uid()));