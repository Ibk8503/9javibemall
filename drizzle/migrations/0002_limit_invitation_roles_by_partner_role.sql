DROP POLICY IF EXISTS "admins create invites" ON public.invitations;
CREATE POLICY "admins create invites" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_partner_admin(partner_id, auth.uid())
    AND invited_by = auth.uid()
    AND (
      role = 'rider'::public.partner_role
      OR (
        role = 'manager'::public.partner_role
        AND public.partner_role_of(partner_id, auth.uid()) = 'owner'::public.partner_role
      )
    )
  );

-- Invitations are only changed by revoking their status in the app; protect
-- the role and token from being modified into an owner invitation.
REVOKE UPDATE ON public.invitations FROM authenticated;
GRANT UPDATE (status) ON public.invitations TO authenticated;