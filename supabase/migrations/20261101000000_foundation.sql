create extension if not exists pgcrypto with schema extensions;
create table public.invites (id uuid primary key default gen_random_uuid(), digest text not null unique, cohort text not null check (cohort in ('attendee','judge')), capacity integer not null default 0 check (capacity >= 0 and (cohort <> 'attendee' or capacity <= 100)), redeemed_count integer not null default 0 check (redeemed_count >= 0 and redeemed_count <= capacity), active boolean not null default false, expires_at timestamptz);
create unique index invites_one_per_cohort on public.invites(cohort);
create table public.access_grants (user_id uuid primary key references auth.users(id), invite_id uuid references public.invites(id), cohort text not null check (cohort in ('attendee','judge','development')), active boolean not null default true, allowance_microusd bigint not null default 0, reserved_microusd bigint not null default 0, spent_microusd bigint not null default 0, editorial_hold_microusd bigint not null default 0, created_at timestamptz not null default now());
create table public.access_attempts (user_id uuid primary key references auth.users(id), window_start timestamptz not null default now(), attempt_count integer not null default 0);
create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id), revision integer not null default 0, analysis_revision integer not null default 0, schema_version integer not null default 1, current_step text not null default 'profile', pause_reason text, document jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deletion_state text not null default 'active');
create table public.media (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), profile_id uuid not null references public.profiles(id), object_path text not null unique, kind text not null, content_type text not null, byte_size bigint not null, status text not null default 'pending', created_at timestamptz not null default now());
-- Retain each signed upload path until its token has expired, including after cancellation or deletion.
create table public.upload_leases (id uuid primary key, user_id uuid not null references auth.users(id), object_path text not null unique, expires_at timestamptz not null default now() + interval '2 hours 5 minutes');
create table public.rounds (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), profile_id uuid not null references public.profiles(id), parent_round_id uuid references public.rounds(id), base_revision integer not null, status text not null, hypothesis jsonb, feedback jsonb, media_ids uuid[], created_at timestamptz not null default now());
create table public.ai_operations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), profile_id uuid not null references public.profiles(id), kind text not null, idempotency_key uuid not null, payload_hash text not null, base_revision integer not null, round_id uuid references public.rounds(id), lease_expires_at timestamptz, client_request_id uuid, state text not null, reserved_microusd bigint not null default 0, settled_microusd bigint not null default 0, provider_ref text, result_ref text, pricing_version text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,idempotency_key));
create table public.budget_pools (cohort text primary key check (cohort in ('attendee','judge','development')), limit_microusd bigint not null default 0, reserved_microusd bigint not null default 0, spent_microusd bigint not null default 0);
insert into public.budget_pools(cohort) values ('attendee'),('judge'),('development');
create table public.budget_control (id boolean primary key default true check (id), total_limit_microusd bigint not null default 50000000, reserved_microusd bigint not null default 0, spent_microusd bigint not null default 0, emergency_disabled boolean not null default true);
insert into public.budget_control(id) values(true);
alter table public.invites enable row level security; alter table public.access_grants enable row level security; alter table public.access_attempts enable row level security; alter table public.profiles enable row level security; alter table public.media enable row level security; alter table public.upload_leases enable row level security; alter table public.rounds enable row level security; alter table public.ai_operations enable row level security; alter table public.budget_pools enable row level security; alter table public.budget_control enable row level security;
create policy own_grant on public.access_grants for select to authenticated using (user_id = auth.uid());
create policy own_profile on public.profiles for select to authenticated using (user_id = auth.uid() and exists (select 1 from public.access_grants g where g.user_id=auth.uid() and g.active));
create policy own_media on public.media for select to authenticated using (user_id = auth.uid() and exists (select 1 from public.access_grants g where g.user_id=auth.uid() and g.active));
create policy own_rounds on public.rounds for select to authenticated using (user_id = auth.uid() and exists (select 1 from public.access_grants g where g.user_id=auth.uid() and g.active));
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant select on public.access_grants, public.profiles, public.media, public.rounds to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('private-media','private-media',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
-- All write RPCs use service_role only; the web server passes a verified auth user ID.
create function public.redeem_invite(p_user uuid,p_digest text) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare g public.access_grants; i public.invites; a public.access_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into g from public.access_grants where user_id=p_user;
  if found then return jsonb_build_object('status',case when g.active then 'activated' else 'disabled' end,'cohort',g.cohort); end if;
  insert into public.access_attempts(user_id) values(p_user) on conflict do nothing;
  select * into a from public.access_attempts where user_id=p_user for update;
  if a.window_start < now()-interval '15 minutes' then update public.access_attempts set window_start=now(),attempt_count=1 where user_id=p_user;
  elsif a.attempt_count >= 10 then return jsonb_build_object('status','rate_limited');
  else update public.access_attempts set attempt_count=attempt_count+1 where user_id=p_user; end if;
  select * into i from public.invites where digest=p_digest for update;
  if not found or not i.active or (i.expires_at is not null and i.expires_at <= now()) then return jsonb_build_object('status','invalid'); end if;
  if i.redeemed_count >= i.capacity then return jsonb_build_object('status','full'); end if;
  insert into public.access_grants(user_id,invite_id,cohort) values(p_user,i.id,i.cohort);
  insert into public.profiles(user_id) values(p_user);
  update public.invites set redeemed_count=redeemed_count+1 where id=i.id;
  return jsonb_build_object('status','activated','cohort',i.cohort);
end $$;
create function public.create_pending_media(p_user uuid,p_id uuid,p_path text,p_kind text,p_type text,p_size bigint) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.profiles; m public.media;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
  select * into p from public.profiles where user_id=p_user and deletion_state='active' for update;
  if not found then return jsonb_build_object('error','forbidden'); end if;
  if (select count(*) from public.media where user_id=p_user and status='pending') >= 4 or (select count(*) from public.media where user_id=p_user and kind='colour_portrait' and status in ('pending','ready')) >= 4 or coalesce((select sum(byte_size) from public.media where user_id=p_user and status in ('pending','ready')),0)+p_size > 104857600 then return jsonb_build_object('error','storage_limit'); end if;
  insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size) values(p_id,p_user,p.id,p_path,p_kind,p_type,p_size) returning * into m;
  insert into public.upload_leases(id,user_id,object_path) values(p_id,p_user,p_path);
  return to_jsonb(m);
end $$;
revoke all on function public.redeem_invite(uuid,text), public.create_pending_media(uuid,uuid,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.redeem_invite(uuid,text), public.create_pending_media(uuid,uuid,text,text,text,bigint) to service_role;
create function public.save_profile(p_user uuid,p_revision integer,p_step text,p_pause text,p_document jsonb) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  select * into p from public.profiles where user_id=p_user for update;
  if not found or p.deletion_state <> 'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
  if p.revision <> p_revision then return jsonb_build_object('error','conflict','currentRevision',p.revision); end if;
  update public.profiles set revision=revision+1, analysis_revision=analysis_revision+case when p_document is distinct from document then 1 else 0 end, current_step=coalesce(p_step,current_step), pause_reason=p_pause, document=coalesce(p_document,document), updated_at=now() where id=p.id returning * into p;
  return jsonb_build_object('profile',to_jsonb(p));
end $$;
revoke all on function public.save_profile(uuid,integer,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_profile(uuid,integer,text,text,jsonb) to service_role;
create function public.finish_media(p_user uuid,p_id uuid,p_path text,p_size bigint) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.profiles;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state <> 'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return false; end if;
 update public.media set status='ready',object_path=p_path,content_type='image/jpeg',byte_size=p_size where id=p_id and user_id=p_user and status='processing';
 return found;
end $$;
create function public.begin_profile_deletion(p_user uuid) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
 update public.profiles set deletion_state='deleting',document='{}'::jsonb,updated_at=now() where user_id=p_user and deletion_state in ('active','deleting');
 return found;
end $$;
revoke all on function public.finish_media(uuid,uuid,text,bigint), public.begin_profile_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finish_media(uuid,uuid,text,bigint), public.begin_profile_deletion(uuid) to service_role;
