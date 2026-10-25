create type public.partner_role as enum ('owner','manager','rider');
create type public.order_status as enum ('pending','acknowledged','in_transit','delivered','failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_code text not null unique,
  created_at timestamptz not null default now()
);
grant select, update on public.partners to authenticated;
grant all on public.partners to service_role;
alter table public.partners enable row level security;

create table public.partner_api_credentials (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  api_key text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
grant select on public.partner_api_credentials to authenticated;
grant all on public.partner_api_credentials to service_role;
alter table public.partner_api_credentials enable row level security;

create table public.partner_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.partner_role not null default 'rider',
  created_at timestamptz not null default now(),
  unique (partner_id, user_id)
);
grant select, insert, update, delete on public.partner_members to authenticated;
grant all on public.partner_members to service_role;
alter table public.partner_members enable row level security;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null,
  role public.partner_role not null default 'rider',
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  order_ref text not null,
  customer_name text not null,
  customer_phone text,
  pickup_address text,
  dropoff_address text not null,
  items text,
  amount numeric(12,2) not null default 0,
  status public.order_status not null default 'pending',
  assigned_rider uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;

create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert on public.delivery_events to authenticated;
grant all on public.delivery_events to service_role;
alter table public.delivery_events enable row level security;

-- helpers
create or replace function public.is_partner_member(_partner_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partner_members m where m.partner_id = _partner_id and m.user_id = _user_id)
$$;

create or replace function public.partner_role_of(_partner_id uuid, _user_id uuid)
returns public.partner_role language sql stable security definer set search_path = public as $$
  select m.role from public.partner_members m where m.partner_id = _partner_id and m.user_id = _user_id
$$;

create or replace function public.is_partner_admin(_partner_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_members m
    where m.partner_id = _partner_id and m.user_id = _user_id and m.role in ('owner','manager')
  )
$$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.update_updated_at_column();

-- policies
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile write" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create policy "members read partner" on public.partners for select to authenticated
  using (public.is_partner_member(id, auth.uid()));
create policy "admins update partner" on public.partners for update to authenticated
  using (public.is_partner_admin(id, auth.uid())) with check (public.is_partner_admin(id, auth.uid()));

create policy "admins read api key" on public.partner_api_credentials for select to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

create policy "members read team" on public.partner_members for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "admins manage team" on public.partner_members for update to authenticated
  using (public.is_partner_admin(partner_id, auth.uid())) with check (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins remove team" on public.partner_members for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

create policy "admins read invites" on public.invitations for select to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins create invites" on public.invitations for insert to authenticated
  with check (public.is_partner_admin(partner_id, auth.uid()) and invited_by = auth.uid());
create policy "admins update invites" on public.invitations for update to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins delete invites" on public.invitations for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

create policy "members read orders" on public.orders for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "admins create orders" on public.orders for insert to authenticated
  with check (public.is_partner_admin(partner_id, auth.uid()));
create policy "members update orders" on public.orders for update to authenticated
  using (
    public.is_partner_admin(partner_id, auth.uid())
    or (public.is_partner_member(partner_id, auth.uid())
        and (assigned_rider is null or assigned_rider = auth.uid()))
  )
  with check (public.is_partner_member(partner_id, auth.uid()));
create policy "admins delete orders" on public.orders for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

create policy "members read events" on public.delivery_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_partner_member(o.partner_id, auth.uid())));
create policy "members add events" on public.delivery_events for insert to authenticated
  with check (actor_id = auth.uid() and exists (select 1 from public.orders o where o.id = order_id and public.is_partner_member(o.partner_id, auth.uid())));

-- onboarding: create a partner for a brand new user with sample incoming orders
create or replace function public.bootstrap_partner(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '');
  _pid uuid;
  _code text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;

  insert into public.profiles (id, email, full_name)
  values (_uid, _email, nullif(_name, ''))
  on conflict (id) do update set email = excluded.email;

  select partner_id into _pid from public.partner_members where user_id = _uid limit 1;
  if _pid is not null then return _pid; end if;

  _code := 'SL-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  insert into public.partners (name, partner_code)
  values (coalesce(nullif(_name, ''), 'Smart Logistics Partner'), _code)
  returning id into _pid;

  insert into public.partner_api_credentials (partner_id, api_key)
  values (_pid, 'sl_live_' || encode(gen_random_bytes(24), 'hex'));

  insert into public.partner_members (partner_id, user_id, role) values (_pid, _uid, 'owner');

  insert into public.orders (partner_id, order_ref, customer_name, customer_phone, pickup_address, dropoff_address, items, amount, status)
  values
    (_pid, '9VM-10241', 'Adaeze Okonkwo', '+2348031122334', '9jaVibeMall Hub, Ikeja', '14 Adeniyi Jones Ave, Ikeja, Lagos', '1x Bluetooth Speaker, 2x Phone Case', 42500.00, 'pending'),
    (_pid, '9VM-10242', 'Musa Bello', '+2348090011223', '9jaVibeMall Hub, Ikeja', '7 Bode Thomas St, Surulere, Lagos', '1x Air Fryer', 89000.00, 'pending'),
    (_pid, '9VM-10243', 'Chidinma Eze', '+2347066554433', '9jaVibeMall Hub, Ikeja', '22 Awolowo Rd, Ikoyi, Lagos', '3x Ankara Fabric', 31000.00, 'pending'),
    (_pid, '9VM-10238', 'Tunde Ajayi', '+2348123456789', '9jaVibeMall Hub, Ikeja', '5 Opebi Rd, Ikeja, Lagos', '1x Laptop Sleeve', 15500.00, 'acknowledged'),
    (_pid, '9VM-10231', 'Ngozi Umeh', '+2348011223344', '9jaVibeMall Hub, Ikeja', '90 Allen Ave, Ikeja, Lagos', '2x Sneakers', 76000.00, 'delivered');

  update public.orders set acknowledged_at = now() - interval '3 hours' where partner_id = _pid and status <> 'pending';
  update public.orders set delivered_at = now() - interval '1 hour' where partner_id = _pid and status = 'delivered';

  insert into public.delivery_events (order_id, status, note, actor_id)
  select id, status, 'Imported from 9jaVibeMall', _uid from public.orders where partner_id = _pid;

  return _pid;
end; $$;
grant execute on function public.bootstrap_partner(text) to authenticated;

create or replace function public.accept_invitation(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
  _inv public.invitations;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _inv from public.invitations where token = _token;
  if _inv.id is null then raise exception 'Invitation not found'; end if;
  if _inv.status <> 'pending' then raise exception 'Invitation already used'; end if;
  if _inv.expires_at < now() then raise exception 'Invitation expired'; end if;
  if lower(_inv.email) <> _email then raise exception 'This invitation was sent to a different email address'; end if;

  insert into public.profiles (id, email) values (_uid, _email)
  on conflict (id) do update set email = excluded.email;

  insert into public.partner_members (partner_id, user_id, role)
  values (_inv.partner_id, _uid, _inv.role)
  on conflict (partner_id, user_id) do update set role = excluded.role;

  update public.invitations set status = 'accepted', accepted_at = now() where id = _inv.id;
  return _inv.partner_id;
end; $$;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.invitation_preview(_token text)
returns table (partner_name text, email text, role public.partner_role, status text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, i.email, i.role, i.status, i.expires_at
  from public.invitations i join public.partners p on p.id = i.partner_id
  where i.token = _token
$$;
grant execute on function public.invitation_preview(text) to anon, authenticated;

create or replace function public.rotate_api_key(_partner_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare _key text;
begin
  if not public.is_partner_admin(_partner_id, auth.uid()) then raise exception 'not allowed'; end if;
  _key := 'sl_live_' || encode(gen_random_bytes(24), 'hex');
  update public.partner_api_credentials set api_key = _key, rotated_at = now() where partner_id = _partner_id;
  return _key;
end; $$;
grant execute on function public.rotate_api_key(uuid) to authenticated;