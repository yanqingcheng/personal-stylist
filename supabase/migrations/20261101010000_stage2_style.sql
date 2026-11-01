-- Private saved style intake. Paid dispatch remains disabled pending measured bounds.
create table public.style_intakes (
  user_id uuid primary key references auth.users(id),
  profile_id uuid not null unique references public.profiles(id),
  revision integer not null default 0 check (revision >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.style_intakes enable row level security;
revoke all on public.style_intakes from public, anon, authenticated;
grant all on public.style_intakes to service_role;

create function public.save_style_intake(p_user uuid, p_revision integer, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.profiles; i public.style_intakes; photo uuid;
begin
  select * into p from public.profiles where user_id=p_user for update;
  if not found or p.deletion_state <> 'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then
    return jsonb_build_object('error','forbidden');
  end if;
  select * into i from public.style_intakes where user_id=p_user for update;
  if coalesce(i.revision,0) <> p_revision then
    return jsonb_build_object('error','conflict','currentRevision',i.revision);
  end if;
  begin photo := nullif(p_data->>'photoId','')::uuid; exception when invalid_text_representation then return jsonb_build_object('error','photo'); end;
  if photo is not null and not exists(select 1 from public.media where id=photo and user_id=p_user and profile_id=p.id and kind='colour_portrait' and status='ready') then
    return jsonb_build_object('error','photo');
  end if;
  insert into public.style_intakes(user_id,profile_id,revision,data) values(p_user,p.id,1,p_data)
    on conflict(user_id) do update set revision=style_intakes.revision+1,data=excluded.data,updated_at=now()
    returning * into i;
  return jsonb_build_object('intake',jsonb_build_object('revision',i.revision,'data',i.data));
end $$;
revoke all on function public.save_style_intake(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_style_intake(uuid,integer,jsonb) to service_role;

-- Stage 1 deletion is a soft delete. Remove the additional private content at its first step.
create function public.clear_style_on_profile_deletion() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.deletion_state <> 'active' then delete from public.style_intakes where user_id=new.user_id; end if;
  return new;
end $$;
create trigger clear_style_on_profile_deletion after update of deletion_state on public.profiles
for each row execute function public.clear_style_on_profile_deletion();
revoke all on function public.clear_style_on_profile_deletion() from public, anon, authenticated;

-- Operator-controlled prices are disabled until a conservative bound is verified.
create table public.style_price_bounds (
  kind text primary key check(kind in ('generation','editorial')),
  pricing_version text not null,
  bound_microusd bigint not null check(bound_microusd > 0),
  enabled boolean not null default false
);
alter table public.style_price_bounds enable row level security;
revoke all on public.style_price_bounds from public, anon, authenticated;
grant all on public.style_price_bounds to service_role;

-- Serialize accounting and preserve one in-flight call per account. Never trust a
-- browser-supplied amount, model or cohort. Existing keys are checked first.
create function public.reserve_style_operation(p_user uuid,p_key uuid,p_hash text,p_kind text,p_revision integer,p_round uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.profiles; g public.access_grants; b public.budget_control; pool public.budget_pools; price public.style_price_bounds; op public.ai_operations;
begin
  perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
  select * into op from public.ai_operations where user_id=p_user and idempotency_key=p_key;
  if found then
    if op.payload_hash <> p_hash or op.kind <> p_kind then return jsonb_build_object('error','conflict'); end if;
    return jsonb_build_object('operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state,'roundId',op.round_id));
  end if;
  select * into p from public.profiles where user_id=p_user for update;
  select * into g from public.access_grants where user_id=p_user for update;
  if p.id is null or p.deletion_state <> 'active' or g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
  if p_kind not in ('generation','editorial') or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid'); end if;
  if p_kind='generation' and not exists(select 1 from public.style_intakes i join public.media m on m.id::text=i.data->>'photoId' and m.user_id=i.user_id and m.profile_id=i.profile_id and m.status='ready' and m.kind='colour_portrait' where i.user_id=p_user and i.revision=p_revision and i.data->'adultFullBodyConfirmed'='true'::jsonb and nullif(p.document->>'selectedTemplateId','') is not null) then return jsonb_build_object('error','invalid'); end if;
  if p_round is not null and not exists(select 1 from public.rounds where id=p_round and user_id=p_user and profile_id=p.id) then return jsonb_build_object('error','invalid'); end if;
  if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','in_flight'); end if;
  select * into b from public.budget_control where id=true for update;
  select * into pool from public.budget_pools where cohort=g.cohort for update;
  select * into price from public.style_price_bounds where kind=p_kind and enabled;
  if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null or b.total_limit_microusd > 50000000 or b.total_limit_microusd < 0 or b.reserved_microusd < 0 or b.spent_microusd < 0 or pool.limit_microusd < 0 or pool.reserved_microusd < 0 or pool.spent_microusd < 0 or g.allowance_microusd < 0 or g.reserved_microusd < 0 or g.spent_microusd < 0 or g.editorial_hold_microusd < 0 or (select limit_microusd from public.budget_pools where cohort='development') > 5000000 or (select sum(limit_microusd) from public.budget_pools) > b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
  if price.bound_microusd > b.total_limit_microusd-b.spent_microusd-b.reserved_microusd or price.bound_microusd > pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd or price.bound_microusd > g.allowance_microusd-g.spent_microusd-g.reserved_microusd-(case when p_kind='editorial' then 0 else g.editorial_hold_microusd end) then return jsonb_build_object('error','budget'); end if;
  update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
  update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
  update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
  insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,round_id,state,reserved_microusd,pricing_version)
    values(p_user,p.id,p_kind,p_key,p_hash,p_revision,p_round,'reserved',price.bound_microusd,price.pricing_version) returning * into op;
  return jsonb_build_object('operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state,'roundId',op.round_id));
end $$;

-- Only the winning caller may dispatch. An expired running call is uncertain;
-- it retains its reservation and must never be sent again automatically.
create function public.dispatch_style_operation(p_user uuid,p_id uuid,p_lease_seconds integer)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_lease_seconds < 1 or p_lease_seconds > 900 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
  -- Serialize dispatch with profile deletion: never dispatch against a stale active snapshot.
  perform 1 from public.profiles where user_id=p_user and deletion_state='active' for update;
  if not found then return false; end if;
  update public.ai_operations o set state='running',lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
    where o.id=p_id and o.user_id=p_user and o.state='reserved'
      and exists(select 1 from public.profiles where id=o.profile_id and deletion_state='active')
      and exists(select 1 from public.access_grants where user_id=p_user and active)
      and exists(select 1 from public.budget_control where id=true and not emergency_disabled);
  return found;
end $$;
create function public.expire_style_operations(p_user uuid) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
  update public.ai_operations set state='uncertain',updated_at=now() where user_id=p_user and state='running' and lease_expires_at < now();
end $$;

-- Uncertain/missing usage settles at the full reservation; only known pre-send
-- failure can release it entirely. Actual overspend trips the global breaker.
create function public.settle_style_operation(p_user uuid,p_id uuid,p_outcome text,p_actual bigint default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare op public.ai_operations; g public.access_grants; charge bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
  select * into op from public.ai_operations where id=p_id and user_id=p_user for update;
  if not found then return false; end if;
  if p_outcome='failed_before_dispatch' and op.state='reserved' then charge:=0;
  elsif p_outcome in ('succeeded','rejected_result') and op.state='running' then charge:=coalesce(p_actual,op.reserved_microusd);
  elsif p_outcome='uncertain_settled' and op.state='uncertain' then charge:=op.reserved_microusd;
  else return false; end if;
  if charge < 0 then return false; end if;
  select * into g from public.access_grants where user_id=p_user for update;
  if not found then return false; end if;
  update public.budget_control set reserved_microusd=reserved_microusd-op.reserved_microusd,spent_microusd=spent_microusd+charge,emergency_disabled=emergency_disabled or charge>op.reserved_microusd where id=true;
  update public.budget_pools set reserved_microusd=reserved_microusd-op.reserved_microusd,spent_microusd=spent_microusd+charge where cohort=g.cohort;
  update public.access_grants set reserved_microusd=reserved_microusd-op.reserved_microusd,spent_microusd=spent_microusd+charge,editorial_hold_microusd=case when op.kind='editorial' then greatest(0,editorial_hold_microusd-charge) else editorial_hold_microusd end where user_id=p_user;
  update public.ai_operations set state=p_outcome,settled_microusd=charge,updated_at=now() where id=p_id;
  return true;
end $$;
revoke all on function public.reserve_style_operation(uuid,uuid,text,text,integer,uuid), public.dispatch_style_operation(uuid,uuid,integer), public.expire_style_operations(uuid), public.settle_style_operation(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.reserve_style_operation(uuid,uuid,text,text,integer,uuid), public.dispatch_style_operation(uuid,uuid,integer), public.expire_style_operations(uuid), public.settle_style_operation(uuid,uuid,text,bigint) to service_role;
