DROP POLICY IF EXISTS "admins manage team" ON public.partner_members;
CREATE POLICY "owners manage team" ON public.partner_members FOR UPDATE TO authenticated
  USING (public.partner_role_of(partner_id, auth.uid())::text = 'owner')
  WITH CHECK (public.partner_role_of(partner_id, auth.uid())::text = 'owner');
CREATE POLICY "managers manage riders" ON public.partner_members FOR UPDATE TO authenticated
  USING (public.partner_role_of(partner_id, auth.uid())::text = 'manager' AND role::text = 'rider')
  WITH CHECK (public.partner_role_of(partner_id, auth.uid())::text = 'manager' AND role::text = 'rider');

DROP POLICY IF EXISTS "read own or admin issues" ON public.issue_reports;
CREATE POLICY "read own or admin issues" ON public.issue_reports FOR SELECT TO authenticated
  USING ((reporter_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid())) OR public.is_partner_admin(partner_id, auth.uid()));
DROP POLICY IF EXISTS "update own or admin issues" ON public.issue_reports;
CREATE POLICY "update own or admin issues" ON public.issue_reports FOR UPDATE TO authenticated
  USING ((reporter_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid())) OR public.is_partner_admin(partner_id, auth.uid()))
  WITH CHECK (public.is_partner_member(partner_id, auth.uid()));
DROP POLICY IF EXISTS "delete own issues" ON public.issue_reports;
CREATE POLICY "delete own issues" ON public.issue_reports FOR DELETE TO authenticated
  USING (reporter_id = auth.uid() AND public.is_partner_member(partner_id, auth.uid()));