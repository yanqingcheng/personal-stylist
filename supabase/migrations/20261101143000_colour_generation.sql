-- Extend the existing shared ledger. No price is installed/enabled and no
-- emergency switch, cohort allowance or global budget is changed here.
alter table public.style_price_bounds drop constraint style_price_bounds_kind_check;
alter table public.style_price_bounds add constraint style_price_bounds_kind_check check(kind in ('generation','editorial','composite'));

create function public.colour_generation_sources_valid(p_user uuid,p_profile uuid,p_document jsonb,p_sources uuid[])
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(cardinality(p_sources)=4
 and (select count(distinct x) from unnest(p_sources) x)=4
 and jsonb_typeof(p_document->'photos')='array'
 and (select count(*) from public.media m where m.id=any(p_sources) and m.user_id=p_user
      and m.profile_id=p_profile and m.kind='colour_portrait' and m.status='ready')=4
 and not exists(select 1 from unnest(p_sources) x where not exists(
   select 1 from jsonb_array_elements(case when jsonb_typeof(p_document->'photos')='array' then p_document->'photos' else '[]'::jsonb end) photo
   where photo->>'id'=x::text)),false)
$$;

create function public.reserve_colour_generation(p_user uuid,p_key uuid,p_hash text,p_revision integer,p_sources uuid[],p_pricing_version text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; g public.access_grants; b public.budget_control; pool public.budget_pools; price public.style_price_bounds; op public.ai_operations;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into g from public.access_grants where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
 select * into op from public.ai_operations where user_id=p_user and idempotency_key=p_key;
 if found then
  if op.payload_hash<>p_hash or op.kind<>'composite' then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('created',false,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state,'referenceId',op.result_ref));
 end if;
 perform id from public.media where id=any(p_sources) for share;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_key is null or p_revision is distinct from p.revision
 or not public.colour_generation_sources_valid(p_user,p.id,p.document,p_sources) then return jsonb_build_object('error','invalid'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','in_flight'); end if;
 select * into b from public.budget_control where id=true for update;
 select * into pool from public.budget_pools where cohort=g.cohort for update;
 select * into price from public.style_price_bounds where kind='composite' and enabled and pricing_version=p_pricing_version;
 if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null
 or b.total_limit_microusd>50000000 or b.total_limit_microusd<0 or b.reserved_microusd<0 or b.spent_microusd<0
 or pool.limit_microusd<0 or pool.reserved_microusd<0 or pool.spent_microusd<0 or g.allowance_microusd<0
 or g.reserved_microusd<0 or g.spent_microusd<0 or g.editorial_hold_microusd<0
 or (select limit_microusd from public.budget_pools where cohort='development')>5000000
 or (select sum(limit_microusd) from public.budget_pools)>b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
 if price.bound_microusd>b.total_limit_microusd-b.spent_microusd-b.reserved_microusd
 or price.bound_microusd>pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd
 or price.bound_microusd>g.allowance_microusd-g.spent_microusd-g.reserved_microusd-g.editorial_hold_microusd then return jsonb_build_object('error','budget'); end if;
 update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
 update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
 insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,state,reserved_microusd,pricing_version)
 values(p_user,p.id,'composite',p_key,p_hash,p_revision,'reserved',price.bound_microusd,price.pricing_version) returning * into op;
 return jsonb_build_object('created',true,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state));
end $$;

create function public.dispatch_colour_generation(p_user uuid,p_op uuid,p_sources uuid[])
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; o public.ai_operations;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into o from public.ai_operations where id=p_op and user_id=p_user;
 perform id from public.media where id=any(p_sources) for share;
 if p.id is null or p.deletion_state<>'active' or o.kind is distinct from 'composite' or o.base_revision is distinct from p.revision
 or not public.colour_generation_sources_valid(p_user,p.id,p.document,p_sources) then return false; end if;
 return public.dispatch_style_operation(p_user,p_op,900);
end $$;

-- Register paths before upload, so deletion can clean even a late/crashed upload.
create function public.lease_colour_generation_upload(p_user uuid,p_op uuid,p_media uuid,p_path text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or p_path<>p_user::text||'/generated/'||p_media::text
 or not exists(select 1 from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id and state='running' and kind='composite') then return false; end if;
 insert into public.upload_leases(id,user_id,object_path,expires_at) values(p_media,p_user,p_path,now()+interval '2 hours 5 minutes');
 return true;
end $$;

create function public.finish_colour_generation(p_user uuid,p_op uuid,p_media uuid,p_path text,p_size bigint,p_sources uuid[])
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; o public.ai_operations; registered jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into o from public.ai_operations where id=p_op and user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or o.kind is distinct from 'composite' or o.state is distinct from 'running'
 or o.profile_id is distinct from p.id or o.base_revision is distinct from p.revision
 or p_size is null or p_size<=0 or p_size>10485760 or p_path<>p_user::text||'/generated/'||p_media::text
 or not public.colour_generation_sources_valid(p_user,p.id,p.document,p_sources)
 or not exists(select 1 from public.upload_leases where id=p_media and user_id=p_user and object_path=p_path and expires_at>now()) then return jsonb_build_object('error','stale'); end if;
 insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size,status)
 values(p_media,p_user,p.id,p_path,'colour_reference','image/png',p_size,'ready');
 registered:=public.register_colour_reference(p_user,p_media,p_sources,'api','Inferred neutral-light composite; not calibrated colour evidence. Operation '||p_op::text);
 if registered ? 'error' then raise exception 'reference registration failed'; end if;
 update public.ai_operations set result_ref=registered->'reference'->>'id',updated_at=now() where id=p_op;
 return jsonb_build_object('referenceId',registered->'reference'->>'id','status','pending');
end $$;

-- Only the trusted transport's explicit dispatchStarted=false may use this.
-- Any network attempt/unknown result instead uses mark_style_uncertain, held.
create function public.release_colour_generation_unspent(p_user uuid,p_op uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 update public.ai_operations set state='reserved',lease_expires_at=null where id=p_op and user_id=p_user and kind='composite' and state='running';
 if not found then return false; end if;
 return public.settle_style_operation(p_user,p_op,'failed_before_dispatch');
end $$;
revoke all on function public.colour_generation_sources_valid(uuid,uuid,jsonb,uuid[]),public.reserve_colour_generation(uuid,uuid,text,integer,uuid[],text),public.dispatch_colour_generation(uuid,uuid,uuid[]),public.lease_colour_generation_upload(uuid,uuid,uuid,text),public.finish_colour_generation(uuid,uuid,uuid,text,bigint,uuid[]),public.release_colour_generation_unspent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.colour_generation_sources_valid(uuid,uuid,jsonb,uuid[]),public.reserve_colour_generation(uuid,uuid,text,integer,uuid[],text),public.dispatch_colour_generation(uuid,uuid,uuid[]),public.lease_colour_generation_upload(uuid,uuid,uuid,text),public.finish_colour_generation(uuid,uuid,uuid,text,bigint,uuid[]),public.release_colour_generation_unspent(uuid,uuid) to service_role;
