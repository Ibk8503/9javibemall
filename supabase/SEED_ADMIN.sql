-- ============================================================================
-- 9jaVibeMall Logistics Hub — CREATE / PROMOTE A PLATFORM ADMIN
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/juzdxlfleuaunfshjtwn/sql/new
--
-- This file contains NO credentials. It generates a strong random password for
-- a brand-new account and prints it once in the SQL editor output.
--
-- Safe to re-run:
--   * an existing account is only promoted — its password is never changed
--   * every insert is idempotent
--
-- Platform admins (public.platform_support) can open the /oversight console:
-- partner approvals, all deliveries, rider ratings and admin management.
-- ============================================================================

do $$
declare
  -- >>> SET THIS BEFORE RUNNING <<<
  _email text := 'owner@example.com';
  _name  text := 'Platform Admin';
  _pass  text := substr(
                   md5(random()::text || clock_timestamp()::text)
                   || md5(clock_timestamp()::text || random()::text), 1, 24);
  _uid   uuid;
  _created boolean := false;
begin
  if _email is null or _email = '' or _email = 'owner@example.com' then
    raise exception 'Set _email at the top of this script before running it.';
  end if;

  select id into _uid from auth.users where lower(email) = lower(_email) limit 1;

  if _uid is null then
    _uid := gen_random_uuid();
    _created := true;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      _uid,
      'authenticated',
      'authenticated',
      _email,
      crypt(_pass, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', _name)
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      _uid,
      _uid::text,
      'email',
      jsonb_build_object('sub', _uid::text, 'email', _email, 'email_verified', true),
      now(), now(), now()
    );
  else
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at         = now()
    where id = _uid;
  end if;

  insert into public.profiles (id, email, full_name)
  values (_uid, _email, _name)
  on conflict (id) do update set email = excluded.email;

  -- Promote to platform admin (this is what unlocks /oversight).
  insert into public.platform_support (user_id)
  values (_uid)
  on conflict (user_id) do nothing;

  -- If the account also belongs to a workspace, make sure that workspace is
  -- approved so the console is usable straight away.
  update public.partners p
  set approval_status = 'approved',
      approved_at     = coalesce(p.approved_at, now()),
      approved_by     = coalesce(p.approved_by, _uid)
  where p.id in (select partner_id from public.partner_members where user_id = _uid);

  raise notice 'Platform admin ready: % (user_id=%)', _email, _uid;
  if _created then
    raise notice 'Temporary password for % : %  (copy it now — it is not stored anywhere)', _email, _pass;
  else
    raise notice 'Account % already existed — its password was left unchanged.', _email;
  end if;
end $$;

-- Verify
select u.email,
       (ps.user_id is not null) as is_platform_admin,
       p.name                   as workspace,
       p.approval_status        as workspace_status
from auth.users u
left join public.platform_support ps on ps.user_id = u.id
left join public.partner_members m   on m.user_id  = u.id
left join public.partners p          on p.id       = m.partner_id
order by is_platform_admin desc, u.email;
