revoke execute on function public.is_partner_member(uuid, uuid) from public, anon;
revoke execute on function public.partner_role_of(uuid, uuid) from public, anon;
revoke execute on function public.is_partner_admin(uuid, uuid) from public, anon;
revoke execute on function public.bootstrap_partner(text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.rotate_api_key(uuid) from public, anon;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;