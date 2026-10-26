-- ============================================================================
-- 9jaVibeMall Logistics Hub — FULL DATABASE RECREATION SCRIPT
-- ----------------------------------------------------------------------------
-- Target Supabase project : juzdxlfleuaunfshjtwn
-- Project URL             : https://juzdxlfleuaunfshjtwn.supabase.co
--
-- HOW TO RUN
--   1. Open https://supabase.com/dashboard/project/juzdxlfleuaunfshjtwn/sql/new
--   2. Paste this ENTIRE file.
--   3. Click "Run".  It is safe to run more than once (it resets, then rebuilds).
--   4. Optionally set the owner email in SECTION 10 (defaults to a
--      placeholder that stops the seed from running by accident).
--
-- WHAT IT DOES
--   * drops and recreates every table / enum / function / policy the app uses
--   * recreates the RLS model (partner isolation + platform-support access)
--   * enables realtime on the tables the UI subscribes to
--   * seeds the workspace, API key and a realistic demo order set
--
-- CREDENTIALS
--   This file intentionally contains NO passwords and no seeded login.
--   Set the owner address in SECTION 10 before running (it generates a random
--   password and prints it once in the SQL editor output), or create the
--   account separately with supabase/SEED_ADMIN.sql.
-- ============================================================================

set search_path = public, extensions, auth;

-- ============================================================================
-- SECTION 0 — EXTENSIONS
-- ============================================================================
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";


-- ============================================================================
-- SECTION 1 — CLEAN RESET
-- ============================================================================

-- 1a. drop helper / RPC functions (by signature, so this is idempotent)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'is_partner_member','partner_role_of','is_partner_admin','is_platform_support',
        'update_updated_at_column','sync_assigned_rider_columns',
        'bootstrap_partner','accept_invitation','invitation_preview','rotate_api_key',
        'verify_partner_api_key','create_partner_order','get_partner_order_by_id',
        'check_unattended_orders','mark_notification_read','mark_all_notifications_read',
        'partner_team','set_partner_approval','add_platform_admin','remove_platform_admin',
        'list_platform_admins','escalate_unacknowledged_orders'
      ])
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;

-- 1b. drop tables (children first)
drop table if exists public.support_emails      cascade;
drop table if exists public.issue_replies       cascade;
drop table if exists public.issue_reports       cascade;
drop table if exists public.delivery_ratings    cascade;
drop table if exists public.rider_locations     cascade;
drop table if exists public.rider_availability  cascade;
drop table if exists public.webhook_logs        cascade;
drop table if exists public.user_device_tokens  cascade;
drop table if exists public.notifications       cascade;
drop table if exists public.delivery_events     cascade;
drop table if exists public.orders              cascade;
drop table if exists public.invitations         cascade;
drop table if exists public.partner_members     cascade;
drop table if exists public.partner_api_credentials cascade;
drop table if exists public.partners            cascade;
drop table if exists public.platform_support    cascade;
drop table if exists public.profiles            cascade;

-- 1c. drop enums
drop type if exists public.issue_status  cascade;
drop type if exists public.order_status  cascade;
drop type if exists public.partner_role  cascade;


-- ============================================================================
-- SECTION 2 — ENUM TYPES
-- ============================================================================
create type public.partner_role as enum ('owner', 'manager', 'rider');
create type public.order_status as enum ('pending', 'acknowledged', 'in_transit', 'delivered', 'failed');
create type public.issue_status as enum ('open', 'in_progress', 'resolved', 'closed');


-- ============================================================================
-- SECTION 3 — TABLES
-- ============================================================================

-- 3.1 profiles ---------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- 3.2 partners ---------------------------------------------------------------
create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  partner_code    text not null unique,
  approval_status text not null default 'pending',
  approved_at     timestamptz,
  approved_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_partners_approval on public.partners (approval_status, created_at desc);

-- 3.3 partner_api_credentials ------------------------------------------------
create table public.partner_api_credentials (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  api_key    text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- 3.4 partner_members --------------------------------------------------------
create table public.partner_members (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.partner_role not null default 'rider',
  created_at timestamptz not null default now(),
  unique (partner_id, user_id)
);
create index idx_partner_members_user on public.partner_members (user_id);

-- 3.5 invitations ------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  email       text not null,
  role        public.partner_role not null default 'rider',
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status      text not null default 'pending',
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_invitations_partner on public.invitations (partner_id, created_at desc);

-- 3.6 orders -----------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  partner_id           uuid not null references public.partners(id) on delete cascade,
  order_ref            text not null,
  pickup_address       text not null,
  pickup_contact_name  text,
  pickup_contact_phone text,
  dropoff_address      text not null,
  dropoff_contact_name text,
  dropoff_contact_phone text,
  items                text,
  status               public.order_status not null default 'pending',
  assigned_rider       uuid references auth.users(id) on delete set null,
  assigned_rider_id    uuid references auth.users(id) on delete set null,
  acknowledged_at      timestamptz,
  delivered_at         timestamptz,
  webhook_url          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_orders_partner_created on public.orders (partner_id, created_at desc);
create index idx_orders_partner_status  on public.orders (partner_id, status);
create index idx_orders_rider           on public.orders (assigned_rider_id);
create index idx_orders_partner_ref     on public.orders (partner_id, order_ref);

-- 3.7 delivery_events --------------------------------------------------------
create table public.delivery_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     public.order_status not null,
  note       text,
  location   text,
  latitude   double precision,
  longitude  double precision,
  actor_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_delivery_events_order on public.delivery_events (order_id, created_at);

-- 3.8 notifications ----------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  type       text not null,
  order_id   uuid references public.orders(id) on delete cascade,
  title      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_unread on public.notifications (user_id, is_read, created_at desc);
create index idx_notifications_order_type  on public.notifications (order_id, type);

-- 3.9 user_device_tokens (web push / FCM) ------------------------------------
create table public.user_device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  partner_id  uuid not null references public.partners(id) on delete cascade,
  token       text not null unique,
  device_type text not null default 'web',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_user_device_tokens_user on public.user_device_tokens (user_id);

-- 3.10 webhook_logs ----------------------------------------------------------
create table public.webhook_logs (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid references public.partners(id) on delete cascade,
  order_id         uuid references public.orders(id) on delete cascade,
  order_ref        text,
  webhook_url      text not null,
  event            text not null,
  request_headers  jsonb,
  request_payload  jsonb not null,
  signature        text,
  response_status  integer,
  response_body    text,
  duration_ms      integer,
  error            text,
  created_at       timestamptz not null default now()
);
create index idx_webhook_logs_partner    on public.webhook_logs (partner_id, created_at desc);
create index idx_webhook_logs_order      on public.webhook_logs (order_id);
create index idx_webhook_logs_created_at on public.webhook_logs (created_at desc);

-- 3.11 platform_support (9jaVibeMall platform admins) ------------------------
create table public.platform_support (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3.12 rider_availability ----------------------------------------------------
create table public.rider_availability (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  status     text not null default 'available',
  note       text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (partner_id, user_id)
);
create index idx_rider_availability_partner on public.rider_availability (partner_id, status);

-- 3.13 rider_locations -------------------------------------------------------
create table public.rider_locations (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  latitude   double precision not null,
  longitude  double precision not null,
  accuracy   double precision,
  updated_at timestamptz not null default now()
);
create index idx_rider_locations_partner on public.rider_locations (partner_id, updated_at desc);

-- 3.14 delivery_ratings ------------------------------------------------------
create table public.delivery_ratings (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  order_id   uuid not null references public.orders(id) on delete cascade,
  rider_id   uuid not null references auth.users(id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, rider_id)
);
create index idx_delivery_ratings_partner on public.delivery_ratings (partner_id, created_at desc);
create index idx_delivery_ratings_rider   on public.delivery_ratings (rider_id);

-- 3.15 issue_reports ---------------------------------------------------------
create table public.issue_reports (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  description     text not null,
  recommendation  text,
  status          public.issue_status not null default 'open',
  resolution_note text,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  emailed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_issue_reports_partner on public.issue_reports (partner_id, created_at desc);
create index idx_issue_reports_status  on public.issue_reports (status, created_at desc);

-- 3.16 issue_replies ---------------------------------------------------------
create table public.issue_replies (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issue_reports(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_name text,
  is_support  boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index idx_issue_replies_issue on public.issue_replies (issue_id, created_at);

-- 3.17 support_emails --------------------------------------------------------
create table public.support_emails (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid references public.issue_reports(id) on delete set null,
  partner_id    uuid references public.partners(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,
  order_ref     text,
  partner_name  text,
  kind          text not null,
  subject       text not null,
  recipients    text[] not null default '{}',
  reply_to      text,
  body_preview  text,
  status        text not null default 'queued',
  error         text,
  created_at    timestamptz not null default now()
);
create index idx_support_emails_created on public.support_emails (created_at desc);


-- ============================================================================
-- SECTION 4 — HELPER FUNCTIONS
-- ============================================================================

create or replace function public.is_partner_member(_partner_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_members m
    where m.partner_id = _partner_id and m.user_id = _user_id
  )
$$;

create or replace function public.partner_role_of(_partner_id uuid, _user_id uuid)
returns public.partner_role language sql stable security definer set search_path = public as $$
  select m.role from public.partner_members m
  where m.partner_id = _partner_id and m.user_id = _user_id
$$;

create or replace function public.is_partner_admin(_partner_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_members m
    where m.partner_id = _partner_id and m.user_id = _user_id
      and m.role in ('owner', 'manager')
  )
$$;

create or replace function public.is_platform_support(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_support s where s.user_id = _user_id)
$$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_assigned_rider_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_rider is not null and new.assigned_rider_id is null then
    new.assigned_rider_id := new.assigned_rider;
  elsif new.assigned_rider_id is not null and new.assigned_rider is null then
    new.assigned_rider := new.assigned_rider_id;
  end if;
  return new;
end;
$$;


-- ============================================================================
-- SECTION 5 — TRIGGERS
-- ============================================================================

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_sync_assigned_rider on public.orders;
create trigger trg_sync_assigned_rider
  before insert or update on public.orders
  for each row execute function public.sync_assigned_rider_columns();

drop trigger if exists delivery_ratings_set_updated_at on public.delivery_ratings;
create trigger delivery_ratings_set_updated_at
  before update on public.delivery_ratings
  for each row execute function public.update_updated_at_column();

drop trigger if exists issue_reports_set_updated_at on public.issue_reports;
create trigger issue_reports_set_updated_at
  before update on public.issue_reports
  for each row execute function public.update_updated_at_column();

drop trigger if exists user_device_tokens_set_updated_at on public.user_device_tokens;
create trigger user_device_tokens_set_updated_at
  before update on public.user_device_tokens
  for each row execute function public.update_updated_at_column();


-- ============================================================================
-- SECTION 6 — RPC / STORED PROCEDURES
-- ============================================================================

-- 6.1 create a workspace for the signed-in user on first login -----------------
create or replace function public.bootstrap_partner(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := auth.uid();
  _email text;
  _pid   uuid;
  _code  text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;

  begin
    select email into _email from auth.users where id = _uid;
  exception when others then
    _email := null;
  end;

  if _email is null or _email = '' then
    _email := coalesce(auth.jwt() ->> 'email', '');
  end if;

  insert into public.profiles (id, email, full_name)
  values (_uid, _email, nullif(_name, ''))
  on conflict (id) do update set
    email     = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(nullif(_name, ''), public.profiles.full_name);

  select partner_id into _pid from public.partner_members where user_id = _uid limit 1;
  if _pid is not null then return _pid; end if;

  _code := 'SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.partners (name, partner_code)
  values (coalesce(nullif(_name, ''), 'Smart Logistics Partner'), _code)
  returning id into _pid;

  insert into public.partner_api_credentials (partner_id, api_key)
  values (_pid, 'sl_live_' || replace(gen_random_uuid()::text, '-', '')
                    || replace(gen_random_uuid()::text, '-', ''))
  on conflict (partner_id) do nothing;

  insert into public.partner_members (partner_id, user_id, role)
  values (_pid, _uid, 'owner')
  on conflict (partner_id, user_id) do nothing;

  return _pid;
end;
$$;

-- 6.2 accept a team invitation -----------------------------------------------
create or replace function public.accept_invitation(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := auth.uid();
  _email text;
  _inv   public.invitations;
begin
  if _uid is null then raise exception 'Not authenticated'; end if;

  begin
    select lower(email) into _email from auth.users where id = _uid;
  exception when others then
    _email := null;
  end;

  if _email is null or _email = '' then
    _email := lower(coalesce(auth.jwt() ->> 'email', ''));
  end if;

  if _email is null or _email = '' then
    raise exception 'Unable to verify email address for authenticated user';
  end if;

  select * into _inv from public.invitations where token = _token;

  if _inv.id is null then
    raise exception 'Invitation not found or token is invalid';
  end if;
  if _inv.status = 'revoked' then
    raise exception 'This invitation has been revoked by the workspace administrator';
  end if;
  if _inv.status <> 'pending' then
    raise exception 'This invitation has already been accepted and used';
  end if;
  if _inv.expires_at < now() then
    raise exception 'This invitation has expired';
  end if;
  if lower(trim(_inv.email)) <> lower(trim(_email)) then
    raise exception 'This invitation was sent to % and cannot be accepted with %', _inv.email, _email;
  end if;

  insert into public.profiles (id, email) values (_uid, _email)
  on conflict (id) do update set email = excluded.email;

  insert into public.partner_members (partner_id, user_id, role)
  values (_inv.partner_id, _uid, _inv.role)
  on conflict (partner_id, user_id) do update set role = excluded.role;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = _inv.id;

  return _inv.partner_id;
end;
$$;

-- 6.3 invitation preview (public) --------------------------------------------
create or replace function public.invitation_preview(_token text)
returns table (partner_name text, email text, role public.partner_role, status text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, i.email, i.role, i.status, i.expires_at
  from public.invitations i
  join public.partners p on p.id = i.partner_id
  where i.token = _token
$$;

-- 6.4 rotate API key ---------------------------------------------------------
create or replace function public.rotate_api_key(_partner_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare _key text;
begin
  if not public.is_partner_admin(_partner_id, auth.uid()) then
    raise exception 'not allowed';
  end if;

  _key := 'sl_live_' || replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '');

  update public.partner_api_credentials
  set api_key = _key, rotated_at = now()
  where partner_id = _partner_id;

  return _key;
end;
$$;

-- 6.5 verify API key (public feed) -------------------------------------------
create or replace function public.verify_partner_api_key(_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _partner_id uuid;
begin
  select partner_id into _partner_id
  from public.partner_api_credentials
  where api_key = trim(_key)
  limit 1;

  return _partner_id;
end;
$$;

-- 6.6 public order creation --------------------------------------------------
create or replace function public.create_partner_order(
  _partner_id uuid,
  _order_ref text,
  _pickup_address text,
  _pickup_contact_name text default null,
  _pickup_contact_phone text default null,
  _dropoff_address text default null,
  _dropoff_contact_name text default null,
  _dropoff_contact_phone text default null,
  _items text default null,
  _webhook_url text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _new_order public.orders%rowtype;
begin
  insert into public.orders (
    partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status, webhook_url
  ) values (
    _partner_id, trim(_order_ref), trim(_pickup_address),
    nullif(trim(_pickup_contact_name), ''), nullif(trim(_pickup_contact_phone), ''),
    trim(_dropoff_address),
    nullif(trim(_dropoff_contact_name), ''), nullif(trim(_dropoff_contact_phone), ''),
    nullif(trim(_items), ''), 'pending', nullif(trim(_webhook_url), '')
  )
  returning * into _new_order;

  insert into public.delivery_events (order_id, status, note)
  values (_new_order.id, 'pending', 'Order created via Partner API feed');

  return to_jsonb(_new_order);
end;
$$;

-- 6.7 public order lookup ----------------------------------------------------
create or replace function public.get_partner_order_by_id(_partner_id uuid, _order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _result jsonb;
begin
  select jsonb_build_object(
    'order', to_jsonb(o),
    'delivery_events', coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.created_at)
       from public.delivery_events e where e.order_id = o.id),
      '[]'::jsonb)
  ) into _result
  from public.orders o
  where o.id = _order_id and o.partner_id = _partner_id;

  return _result;
end;
$$;

-- 6.8 unattended order detection ---------------------------------------------
create or replace function public.check_unattended_orders(_partner_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  _order record;
  _admin record;
  _count integer := 0;
begin
  for _order in
    select o.id, o.order_ref, o.partner_id
    from public.orders o
    where o.status = 'pending'
      and o.acknowledged_at is null
      and o.created_at <= (now() - interval '1 hour')
      and (_partner_id is null or o.partner_id = _partner_id)
      and not exists (
        select 1 from public.notifications n
        where n.order_id = o.id and n.type = 'ORDER_UNACKNOWLEDGED'
      )
  loop
    for _admin in
      select pm.user_id from public.partner_members pm
      where pm.partner_id = _order.partner_id and pm.role in ('owner', 'manager')
    loop
      insert into public.notifications
        (user_id, partner_id, type, order_id, title, message, is_read)
      values
        (_admin.user_id, _order.partner_id, 'ORDER_UNACKNOWLEDGED', _order.id,
         'Unattended order',
         'Order ' || _order.order_ref || ' has been waiting for acknowledgement for over 1 hour.',
         false);
      _count := _count + 1;
    end loop;
  end loop;

  return _count;
end;
$$;

-- 6.9 platform-wide escalation (cron / platform admin) -----------------------
create or replace function public.escalate_unacknowledged_orders()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_support(auth.uid()) then
    raise exception 'not allowed';
  end if;
  perform public.check_unattended_orders(null::uuid);
end;
$$;

-- 6.10 notification helpers --------------------------------------------------
create or replace function public.mark_notification_read(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set is_read = true
  where id = _id and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare _count integer;
begin
  update public.notifications set is_read = true
  where user_id = auth.uid() and is_read = false;
  get diagnostics _count = row_count;
  return _count;
end;
$$;

-- 6.11 team directory --------------------------------------------------------
create or replace function public.partner_team(_partner_id uuid)
returns table (user_id uuid, email text, full_name text, role public.partner_role)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_partner_member(_partner_id, auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
    select pm.user_id, p.email, p.full_name, pm.role
    from public.partner_members pm
    left join public.profiles p on p.id = pm.user_id
    where pm.partner_id = _partner_id
    order by case pm.role when 'owner' then 0 when 'manager' then 1 else 2 end,
             pm.created_at;
end;
$$;

-- 6.12 partner approval (platform admin) -------------------------------------
create or replace function public.set_partner_approval(_partner_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_support(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if _status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid approval status: %', _status;
  end if;

  update public.partners
  set approval_status = _status,
      approved_at     = case when _status = 'approved' then now() else null end,
      approved_by     = case when _status = 'approved' then auth.uid() else null end
  where id = _partner_id;
end;
$$;

-- 6.13 platform admin management --------------------------------------------
create or replace function public.add_platform_admin(_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  if exists (select 1 from public.platform_support)
     and not public.is_platform_support(auth.uid()) then
    raise exception 'not allowed';
  end if;

  select id into _uid from auth.users
  where lower(email) = lower(trim(_email)) limit 1;

  if _uid is null then
    raise exception 'No account found for %', _email;
  end if;

  insert into public.platform_support (user_id) values (_uid)
  on conflict (user_id) do nothing;

  return _uid;
end;
$$;

create or replace function public.remove_platform_admin(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_support(auth.uid()) then
    raise exception 'not allowed';
  end if;
  delete from public.platform_support where user_id = _user_id;
end;
$$;

create or replace function public.list_platform_admins()
returns table (user_id uuid, email text, full_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_support(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
    select s.user_id, u.email::text, coalesce(p.full_name, ''), s.created_at
    from public.platform_support s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
    order by s.created_at;
end;
$$;


-- ============================================================================
-- SECTION 7 — ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.partners              enable row level security;
alter table public.partner_api_credentials enable row level security;
alter table public.partner_members       enable row level security;
alter table public.invitations           enable row level security;
alter table public.orders                enable row level security;
alter table public.delivery_events       enable row level security;
alter table public.notifications         enable row level security;
alter table public.user_device_tokens    enable row level security;
alter table public.webhook_logs          enable row level security;
alter table public.platform_support      enable row level security;
alter table public.rider_availability    enable row level security;
alter table public.rider_locations       enable row level security;
alter table public.delivery_ratings      enable row level security;
alter table public.issue_reports         enable row level security;
alter table public.issue_replies         enable row level security;
alter table public.support_emails        enable row level security;

-- 7.1 profiles ---------------------------------------------------------------
create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile write"  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "platform reads profiles" on public.profiles for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.2 partners ---------------------------------------------------------------
create policy "members read partner" on public.partners for select to authenticated
  using (public.is_partner_member(id, auth.uid()));
create policy "admins update partner" on public.partners for update to authenticated
  using (public.is_partner_admin(id, auth.uid()))
  with check (public.is_partner_admin(id, auth.uid()));
create policy "platform reads partners" on public.partners for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.3 partner_api_credentials ------------------------------------------------
create policy "admins read api key" on public.partner_api_credentials for select to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

-- 7.4 partner_members --------------------------------------------------------
create policy "members read team" on public.partner_members for select to authenticated
  using (user_id = auth.uid() or public.is_partner_member(partner_id, auth.uid()));
create policy "admins manage team" on public.partner_members for update to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()))
  with check (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins remove team" on public.partner_members for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "platform reads members" on public.partner_members for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.5 invitations ------------------------------------------------------------
create policy "admins read invites" on public.invitations for select to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins create invites" on public.invitations for insert to authenticated
  with check (public.is_partner_admin(partner_id, auth.uid()) and invited_by = auth.uid());
create policy "admins update invites" on public.invitations for update to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "admins delete invites" on public.invitations for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));

-- 7.6 orders -----------------------------------------------------------------
create policy "members read orders" on public.orders for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "admins create orders" on public.orders for insert to authenticated
  with check (public.is_partner_admin(partner_id, auth.uid()));
create policy "members update orders" on public.orders for update to authenticated
  using (
    public.is_partner_admin(partner_id, auth.uid())
    or (public.is_partner_member(partner_id, auth.uid())
        and (assigned_rider is null or assigned_rider = auth.uid()
             or assigned_rider_id is null or assigned_rider_id = auth.uid()))
  )
  with check (public.is_partner_member(partner_id, auth.uid()));
create policy "admins delete orders" on public.orders for delete to authenticated
  using (public.is_partner_admin(partner_id, auth.uid()));
create policy "platform reads orders" on public.orders for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.7 delivery_events --------------------------------------------------------
create policy "members read events" on public.delivery_events for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and public.is_partner_member(o.partner_id, auth.uid())
  ));
create policy "members add events" on public.delivery_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_partner_member(o.partner_id, auth.uid())
    )
  );
create policy "platform reads events" on public.delivery_events for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.8 notifications ----------------------------------------------------------
create policy "users read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own notifications" on public.notifications for delete to authenticated
  using (user_id = auth.uid());
create policy "admins insert notifications" on public.notifications for insert to authenticated
  with check (public.is_partner_admin(partner_id, auth.uid()) or user_id = auth.uid());

-- 7.9 user_device_tokens -----------------------------------------------------
create policy "users read own tokens" on public.user_device_tokens for select to authenticated
  using (user_id = auth.uid());
create policy "users manage own tokens" on public.user_device_tokens for insert to authenticated
  with check (user_id = auth.uid());
create policy "users update own tokens" on public.user_device_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own tokens" on public.user_device_tokens for delete to authenticated
  using (user_id = auth.uid());

-- 7.10 webhook_logs ----------------------------------------------------------
create policy "partner members view webhook logs" on public.webhook_logs for select to authenticated
  using (
    partner_id is null
    or partner_id in (select pm.partner_id from public.partner_members pm where pm.user_id = auth.uid())
  );
create policy "authenticated users insert webhook logs" on public.webhook_logs for insert to authenticated
  with check (true);
create policy "partner admins delete webhook logs" on public.webhook_logs for delete to authenticated
  using (
    partner_id is null
    or partner_id in (
      select pm.partner_id from public.partner_members pm
      where pm.user_id = auth.uid() and pm.role in ('owner', 'manager')
    )
  );

-- 7.11 platform_support ------------------------------------------------------
create policy "read own support row" on public.platform_support for select to authenticated
  using (user_id = auth.uid() or public.is_platform_support(auth.uid()));

-- 7.12 rider_availability ----------------------------------------------------
create policy "members read availability" on public.rider_availability for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "riders set own availability" on public.rider_availability for insert to authenticated
  with check (
    public.is_partner_member(partner_id, auth.uid())
    and (user_id = auth.uid() or public.is_partner_admin(partner_id, auth.uid()))
  );
create policy "riders update own availability" on public.rider_availability for update to authenticated
  using (
    user_id = auth.uid()
    or public.is_partner_admin(partner_id, auth.uid())
  )
  with check (public.is_partner_member(partner_id, auth.uid()));

-- 7.13 rider_locations -------------------------------------------------------
create policy "members read rider locations" on public.rider_locations for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "riders write own location" on public.rider_locations for insert to authenticated
  with check (user_id = auth.uid() and public.is_partner_member(partner_id, auth.uid()));
create policy "riders update own location" on public.rider_locations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7.14 delivery_ratings ------------------------------------------------------
create policy "members read ratings" on public.delivery_ratings for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "riders create own ratings" on public.delivery_ratings for insert to authenticated
  with check (rider_id = auth.uid() and public.is_partner_member(partner_id, auth.uid()));
create policy "riders update own ratings" on public.delivery_ratings for update to authenticated
  using (rider_id = auth.uid()) with check (rider_id = auth.uid());
create policy "platform reads ratings" on public.delivery_ratings for select to authenticated
  using (public.is_platform_support(auth.uid()));

-- 7.15 issue_reports ---------------------------------------------------------
create policy "members read issues" on public.issue_reports for select to authenticated
  using (public.is_partner_member(partner_id, auth.uid()));
create policy "members create issues" on public.issue_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_partner_member(partner_id, auth.uid()));
create policy "reporters update own issues" on public.issue_reports for update to authenticated
  using (reporter_id = auth.uid() or public.is_partner_admin(partner_id, auth.uid()))
  with check (public.is_partner_member(partner_id, auth.uid()));
create policy "platform reads issues" on public.issue_reports for select to authenticated
  using (public.is_platform_support(auth.uid()));
create policy "platform updates issues" on public.issue_reports for update to authenticated
  using (public.is_platform_support(auth.uid()))
  with check (public.is_platform_support(auth.uid()));

-- 7.16 issue_replies ---------------------------------------------------------
create policy "members read replies" on public.issue_replies for select to authenticated
  using (exists (
    select 1 from public.issue_reports i
    where i.id = issue_id and public.is_partner_member(i.partner_id, auth.uid())
  ));
create policy "members write replies" on public.issue_replies for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.issue_reports i
      where i.id = issue_id and public.is_partner_member(i.partner_id, auth.uid())
    )
  );
create policy "platform reads replies" on public.issue_replies for select to authenticated
  using (public.is_platform_support(auth.uid()));
create policy "platform writes replies" on public.issue_replies for insert to authenticated
  with check (author_id = auth.uid() and public.is_platform_support(auth.uid()));

-- 7.17 support_emails --------------------------------------------------------
create policy "partners read own support mail" on public.support_emails for select to authenticated
  using (partner_id is not null and public.is_partner_admin(partner_id, auth.uid()));
create policy "platform reads support mail" on public.support_emails for select to authenticated
  using (public.is_platform_support(auth.uid()));


-- ============================================================================
-- SECTION 8 — GRANTS
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update          on public.profiles              to authenticated;
grant select, update                  on public.partners              to authenticated;
grant select, insert, update, delete  on public.partner_members       to authenticated;
grant select, insert, update, delete  on public.invitations           to authenticated;
grant select, insert, update, delete  on public.orders                to authenticated;
grant select, insert                  on public.delivery_events       to authenticated;
grant select, insert, update, delete  on public.notifications         to authenticated;
grant select, insert, update, delete  on public.user_device_tokens    to authenticated;
grant select, insert, update, delete  on public.webhook_logs          to authenticated;
grant select, insert, update, delete  on public.rider_availability    to authenticated;
grant select, insert, update, delete  on public.rider_locations       to authenticated;
grant select, insert, update, delete  on public.delivery_ratings      to authenticated;
grant select, insert, update          on public.issue_reports         to authenticated;
grant select, insert                  on public.issue_replies         to authenticated;
grant select                          on public.support_emails        to authenticated;
grant select                          on public.partner_api_credentials to authenticated;
grant select                          on public.platform_support      to authenticated;

grant all on public.profiles                to service_role;
grant all on public.partners                to service_role;
grant all on public.partner_api_credentials to service_role;
grant all on public.partner_members         to service_role;
grant all on public.invitations             to service_role;
grant all on public.orders                  to service_role;
grant all on public.delivery_events         to service_role;
grant all on public.notifications           to service_role;
grant all on public.user_device_tokens      to service_role;
grant all on public.webhook_logs            to service_role;
grant all on public.platform_support        to service_role;
grant all on public.rider_availability      to service_role;
grant all on public.rider_locations         to service_role;
grant all on public.delivery_ratings        to service_role;
grant all on public.issue_reports           to service_role;
grant all on public.issue_replies           to service_role;
grant all on public.support_emails          to service_role;

-- function execute permissions
grant execute on function public.is_partner_member(uuid, uuid)   to anon, authenticated, service_role;
grant execute on function public.partner_role_of(uuid, uuid)     to anon, authenticated, service_role;
grant execute on function public.is_partner_admin(uuid, uuid)    to anon, authenticated, service_role;
grant execute on function public.is_platform_support(uuid)       to authenticated, service_role;

grant execute on function public.bootstrap_partner(text)         to authenticated, service_role;
grant execute on function public.accept_invitation(text)         to authenticated, service_role;
grant execute on function public.invitation_preview(text)        to anon, authenticated, service_role;
grant execute on function public.rotate_api_key(uuid)            to authenticated, service_role;
grant execute on function public.verify_partner_api_key(text)    to anon, authenticated, service_role;
grant execute on function public.create_partner_order(uuid, text, text, text, text, text, text, text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.get_partner_order_by_id(uuid, uuid) to anon, authenticated, service_role;

grant execute on function public.check_unattended_orders(uuid)   to authenticated, service_role;
grant execute on function public.escalate_unacknowledged_orders() to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid)    to authenticated;
grant execute on function public.mark_all_notifications_read()   to authenticated;
grant execute on function public.partner_team(uuid)              to authenticated;
grant execute on function public.set_partner_approval(uuid, text) to authenticated, service_role;
grant execute on function public.add_platform_admin(text)        to authenticated, service_role;
grant execute on function public.remove_platform_admin(uuid)     to authenticated, service_role;
grant execute on function public.list_platform_admins()          to authenticated, service_role;

revoke execute on function public.update_updated_at_column()        from public, anon, authenticated;
revoke execute on function public.sync_assigned_rider_columns()     from public, anon, authenticated;


-- ============================================================================
-- SECTION 9 — REALTIME
-- ============================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'orders', 'delivery_events', 'notifications',
      'rider_locations', 'rider_availability', 'issue_reports', 'issue_replies'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception
        when duplicate_object then null;
        when others then null;
      end;
    end loop;
  end if;
end $$;


-- ============================================================================
-- SECTION 10 — SEED: OWNER WORKSPACE + DEMO ORDERS  (OPTIONAL)
-- ----------------------------------------------------------------------------
-- No credentials live in this file.
--
--   1. Replace the placeholder in _owner_email below with the address that
--      should own the workspace.
--   2. Run this section. A random password is generated and printed once via
--      RAISE NOTICE — copy it from the SQL editor output.
--
-- Re-running is safe: it never overwrites the password of an existing
-- account, it only re-creates missing workspace rows.
--
-- Want an empty workspace (no demo orders)?
--   Run at the end:  delete from public.orders;
-- (delivery events / notifications cascade automatically)
-- ============================================================================
do $$
declare
  -- >>> SET THIS BEFORE RUNNING <<<
  _email  text := 'owner@example.com';
  -- Generated per run; printed once in the SQL editor output.
  -- (md5() is core Postgres, so this needs no extra extension.)
  _pass   text := substr(
                    md5(random()::text || clock_timestamp()::text)
                    || md5(clock_timestamp()::text || random()::text), 1, 24);
  _uid    uuid;
  _pid    uuid;
  _ocode  text := 'SL-9JVBMALL';
  _oid    uuid;
  _first  uuid;
  r       record;
  c       record;
  _created_user boolean := false;
begin
  -- Guard: refuse to run with the placeholder address.
  if _email is null or _email = '' or _email = 'owner@example.com' then
    raise exception 'Set _email in SECTION 10 before running this seed, or use supabase/SEED_ADMIN.sql.';
  end if;

  -- ---------------------------------------------------------------- 10.1 user
  select id into _uid from auth.users where lower(email) = lower(_email) limit 1;

  if _uid is null then
    _uid := gen_random_uuid();
    _created_user := true;

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
      jsonb_build_object('full_name', 'Workspace Owner')
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

    -- GoTrue reads the token columns as Go strings, so a NULL there makes every
    -- sign-in fail with "Database error querying schema". Normalise them to ''.
    -- Generic on purpose: the exact column set differs between GoTrue versions.
    for c in
      select column_name
      from information_schema.columns
      where table_schema = 'auth'
        and table_name   = 'users'
        and data_type in ('character varying', 'text')
        and is_nullable  = 'YES'
        and column_name not in ('email', 'encrypted_password')
    loop
      execute format('update auth.users set %I = %L where id = %L and %I is null',
                     c.column_name, '', _uid, c.column_name);
    end loop;
  else
    -- Existing account: confirm the address but never reset its password.
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at         = now()
    where id = _uid;
  end if;

  -- ------------------------------------------------------------- 10.2 profile
  insert into public.profiles (id, email, full_name)
  values (_uid, _email, 'Workspace Owner')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  -- ------------------------------------------------------------- 10.3 partner
  select id into _pid from public.partners where partner_code = _ocode;
  if _pid is null then
    select partner_id into _pid
    from public.partner_members where user_id = _uid limit 1;
  end if;

  if _pid is null then
    insert into public.partners (name, partner_code, approval_status, approved_at, approved_by)
    values ('9jaVibeMall Logistics', _ocode, 'approved', now(), _uid)
    returning id into _pid;
  else
    update public.partners
    set approval_status = 'approved',
        approved_at     = coalesce(approved_at, now()),
        approved_by     = coalesce(approved_by, _uid)
    where id = _pid;
  end if;

  -- -------------------------------------------------------- 10.4 API + member
  insert into public.partner_api_credentials (partner_id, api_key)
  values (_pid, 'sl_live_' || replace(gen_random_uuid()::text, '-', '')
                    || replace(gen_random_uuid()::text, '-', ''))
  on conflict (partner_id) do nothing;

  insert into public.partner_members (partner_id, user_id, role)
  values (_pid, _uid, 'owner')
  on conflict (partner_id, user_id) do update set role = 'owner';

  -- -------------------------------------------------- 10.5 platform oversight
  insert into public.platform_support (user_id) values (_uid)
  on conflict (user_id) do nothing;

  -- ------------------------------------------------------------ 10.6 demo data
  if not exists (select 1 from public.orders where partner_id = _pid) then
    for r in
      select * from (values
        ('9JV-10241', 'pending',      '14 Adeola Odeku Street, Victoria Island, Lagos', '22 Admiralty Way, Lekki Phase 1, Lagos',      '2x Bluetooth speaker, 1x phone case',        2),
        ('9JV-10242', 'pending',      '9jaVibeMall Warehouse, Ikeja, Lagos',           '5 Bode Thomas Street, Surulere, Lagos',        '1x Electric kettle',                         5),
        ('9JV-10243', 'pending',      '9jaVibeMall Warehouse, Ikeja, Lagos',           '31 Awolowo Road, Ikoyi, Lagos',                '3x Wireless earbuds',                       26),
        ('9JV-10244', 'acknowledged', '7 Allen Avenue, Ikeja, Lagos',                  '12 Opebi Road, Ikeja, Lagos',                  '1x Office chair',                           30),
        ('9JV-10245', 'acknowledged', '9jaVibeMall Warehouse, Ikeja, Lagos',           '4 Aguiyi Ironsi Street, Maitama, Abuja',       '1x Standing desk',                          33),
        ('9JV-10246', 'in_transit',   '9jaVibeMall Warehouse, Ikeja, Lagos',           '18 Ozumba Mbadiwe Avenue, Victoria Island',    '2x Smart watch',                            48),
        ('9JV-10247', 'in_transit',   '9jaVibeMall Warehouse, Ikeja, Lagos',           '6 Ring Road, Ibadan, Oyo',                     '1x Blender',                                52),
        ('9JV-10248', 'in_transit',   '9jaVibeMall Warehouse, Ikeja, Lagos',           '77 Awolowo Way, Ikeja, Lagos',                 '5x Phone charger',                          56),
        ('9JV-10249', 'delivered',    '9jaVibeMall Warehouse, Ikeja, Lagos',           '3 Adebayo Doherty Street, Lekki, Lagos',       '1x Microwave oven',                         74),
        ('9JV-10250', 'delivered',    '9jaVibeMall Warehouse, Ikeja, Lagos',           '10 Ogunlana Drive, Surulere, Lagos',           '4x LED bulb pack',                          80),
        ('9JV-10251', 'delivered',    '9jaVibeMall Warehouse, Ikeja, Lagos',           '2 Ahmadu Bello Way, Kaduna',                   '1x Gaming headset',                         96),
        ('9JV-10252', 'delivered',    '9jaVibeMall Warehouse, Ikeja, Lagos',           '15 Aba Road, Port Harcourt, Rivers',           '1x Air fryer',                             104),
        ('9JV-10253', 'failed',       '9jaVibeMall Warehouse, Ikeja, Lagos',           '8 Eket Road, Uyo, Akwa Ibom',                  '1x Vacuum cleaner',                        120)
      ) as t(order_ref, status, pickup, dropoff, items, age_hours)
    loop
      insert into public.orders (
        partner_id, order_ref, pickup_address, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_contact_name, dropoff_contact_phone, items, status,
        created_at, updated_at, acknowledged_at, delivered_at
      ) values (
        _pid, r.order_ref, r.pickup, '9jaVibeMall Store', '+2348012345678',
        r.dropoff, 'Customer', '+2348098765432', r.items, r.status::public.order_status,
        now() - make_interval(hours => r.age_hours),
        now() - make_interval(hours => r.age_hours) + interval '30 minutes',
        case when r.status <> 'pending'
             then now() - make_interval(hours => r.age_hours) + interval '20 minutes' end,
        case when r.status = 'delivered'
             then now() - make_interval(hours => r.age_hours) + interval '3 hours' end
      )
      returning id into _oid;

      if _first is null and r.status = 'pending' then
        _first := _oid;
      end if;

      insert into public.delivery_events (order_id, status, note, actor_id, created_at)
      values (_oid, 'pending', 'Order created via Partner API feed', null,
              now() - make_interval(hours => r.age_hours));

      if r.status <> 'pending' then
        insert into public.delivery_events (order_id, status, note, actor_id, created_at)
        values (_oid, 'acknowledged', 'Order acknowledged by dispatch', _uid,
                now() - make_interval(hours => r.age_hours) + interval '20 minutes');
      end if;

      if r.status in ('in_transit', 'delivered') then
        insert into public.delivery_events (order_id, status, note, actor_id, created_at)
        values (_oid, 'in_transit', 'Rider picked up the package', _uid,
                now() - make_interval(hours => r.age_hours) + interval '1 hour');
      end if;

      if r.status = 'delivered' then
        insert into public.delivery_events (order_id, status, note, actor_id, created_at)
        values (_oid, 'delivered', 'Delivered to recipient', _uid,
                now() - make_interval(hours => r.age_hours) + interval '3 hours');
      end if;

      if r.status = 'failed' then
        insert into public.delivery_events (order_id, status, note, actor_id, created_at)
        values (_oid, 'failed', 'Recipient unavailable at delivery address', _uid,
                now() - make_interval(hours => r.age_hours) + interval '4 hours');
      end if;
    end loop;

    if _first is not null then
      insert into public.notifications (user_id, partner_id, type, order_id, title, message, is_read, created_at)
      values
        (_uid, _pid, 'ORDER_RECEIVED', _first,
         'New delivery order', 'You have new orders awaiting acknowledgement.',
         false, now() - interval '40 minutes'),
        (_uid, _pid, 'ORDER_UNACKNOWLEDGED', _first,
         'Unattended order', 'One of your orders has been waiting for acknowledgement for over 1 hour.',
         true, now() - interval '20 minutes');
    end if;
  end if;

  raise notice 'Workspace ready. partner_id=%  user_id=%', _pid, _uid;
  if _created_user then
    raise notice 'Temporary password for % : %  (copy it now — it is not stored anywhere)', _email, _pass;
  else
    raise notice 'Existing account % kept its current password.', _email;
  end if;
end $$;


-- ============================================================================
-- DONE.
-- Verify with:
--   select id, email, email_confirmed_at from auth.users;
--   select name, partner_code, approval_status from public.partners;
--   select role, count(*) from public.orders group by 1;
-- ============================================================================
