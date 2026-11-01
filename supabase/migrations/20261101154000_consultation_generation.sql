-- New conversation boundary; uses the existing global, cohort and account ledger.
-- No prices, allowances or enablement switches are changed by this migration.
create table public.consultation_generation_jobs(
 id uuid primary key,
 user_id uuid not null references public.consultation_sessions(user_id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('prepared','dynamic')),
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','uncertain')),
 base_revision integer not null check(base_revision>=0),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 action_id uuid references public.consultation_actions(id) on delete cascade,
 parent_output_id text,
 adult_confirmed boolean not null default false,
 adult_confirmation_source text not null check(adult_confirmation_source in ('explicit-generation-request','saved-intake','unknown')),
 operation_id uuid references public.ai_operations(id),
 requirements jsonb not null default '[]',
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.consultation_generation_jobs enable row level security;
revoke all on public.consultation_generation_jobs from public,anon,authenticated;
grant all on public.consultation_generation_jobs to service_role;
create function public.consultation_generation_json(j public.consultation_generation_jobs) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',j.id,'state',j.status,'mode',j.mode,'baseRevision',j.base_revision,'actionId',j.action_id,'parentOutputId',j.parent_output_id,'operationId',j.operation_id,'missingRequirements',j.requirements,'output',j.result,'createdAt',j.created_at)
$$;
create function public.create_consultation_generation(p_user uuid,p_id uuid,p_revision integer,p_mode text,p_payload_hash text,p_input_hash text,p_action uuid default null,p_parent text default null,p_adult boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; j public.consultation_generation_jobs; a public.consultation_actions;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 select * into j from public.consultation_generation_jobs where id=p_id;
 if found then
  if j.user_id<>p_user or j.payload_hash<>p_payload_hash then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('job',public.consultation_generation_json(j),'replayed',true);
 end if;
 if p_revision is distinct from s.revision then return jsonb_build_object('error','conflict','consultation',public.read_consultation(p_user)); end if;
 if p_mode not in ('prepared','dynamic') or p_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or (p_parent is not null and length(p_parent) not between 1 and 200) then return jsonb_build_object('error','invalid'); end if;
 if p_action is not null then
  select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
  if a.id is null or a.kind<>'request_revision' or a.status<>'pending' or a.base_revision<>s.revision or a.output_id is distinct from p_parent then return jsonb_build_object('error','action'); end if;
 elsif p_parent is not null then return jsonb_build_object('error','action');
 end if;
 insert into public.consultation_generation_jobs(id,user_id,profile_id,mode,base_revision,payload_hash,input_hash,action_id,parent_output_id,adult_confirmed,adult_confirmation_source)
 values(p_id,p_user,p.id,p_mode,p_revision,p_payload_hash,p_input_hash,p_action,p_parent,coalesce(p_adult,false) or exists(select 1 from public.style_intakes where user_id=p_user and profile_id=p.id and data->'adultFullBodyConfirmed'='true'::jsonb),case when p_adult then 'explicit-generation-request' when exists(select 1 from public.style_intakes where user_id=p_user and profile_id=p.id and data->'adultFullBodyConfirmed'='true'::jsonb) then 'saved-intake' else 'unknown' end) returning * into j;
 return jsonb_build_object('job',public.consultation_generation_json(j),'replayed',false);
end $$;

create function public.start_consultation_generation(p_user uuid,p_job uuid,p_input_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; j public.consultation_generation_jobs; g public.access_grants; b public.budget_control; pool public.budget_pools; price public.style_price_bounds; op public.ai_operations;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into j from public.consultation_generation_jobs where id=p_job and user_id=p_user and profile_id=p.id for update;
 if j.id is null or j.mode<>'dynamic' or j.input_hash is distinct from p_input_hash or j.base_revision is distinct from s.revision then return jsonb_build_object('error','conflict'); end if;
 if j.input_hash is distinct from public.style_input_hash(p.document,coalesce((select data from public.style_intakes where user_id=p_user and profile_id=p.id),'{}'::jsonb)) then return jsonb_build_object('error','conflict'); end if;
 if j.status<>'pending' then return jsonb_build_object('job',public.consultation_generation_json(j),'created',false); end if;
 if not j.adult_confirmed then return jsonb_build_object('error','adult'); end if;
 if exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages r where r.reply_to=m.id and r.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 if not exists(select 1 from public.style_intakes where user_id=p_user and profile_id=p.id and data->>'garmentDomain' in ('menswear','womenswear')) or not exists(select 1 from public.media where user_id=p_user and profile_id=p.id and id::text=p.document->>'referencePhotoId' and status='ready' and kind='colour_portrait') then return jsonb_build_object('error','reference'); end if;
 if j.action_id is not null and not exists(select 1 from public.consultation_actions where id=j.action_id and user_id=p_user and kind='request_revision' and status='pending' and base_revision=s.revision and output_id=j.parent_output_id) then return jsonb_build_object('error','action'); end if;
 select * into g from public.access_grants where user_id=p_user for update;
 if g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running','uncertain')) then return jsonb_build_object('error','in_flight'); end if;
 select * into b from public.budget_control where id=true for update;
 select * into pool from public.budget_pools where cohort=g.cohort for update;
 select * into price from public.style_price_bounds where kind='generation' and enabled;
 if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null or b.total_limit_microusd>50000000 or b.total_limit_microusd<0 or b.reserved_microusd<0 or b.spent_microusd<0 or pool.limit_microusd<0 or pool.reserved_microusd<0 or pool.spent_microusd<0 or g.allowance_microusd<0 or g.reserved_microusd<0 or g.spent_microusd<0 or g.editorial_hold_microusd<0 or (select limit_microusd from public.budget_pools where cohort='development')>5000000 or (select sum(limit_microusd) from public.budget_pools)>b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
 if price.bound_microusd>b.total_limit_microusd-b.spent_microusd-b.reserved_microusd or price.bound_microusd>pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd or price.bound_microusd>g.allowance_microusd-g.spent_microusd-g.reserved_microusd-g.editorial_hold_microusd then return jsonb_build_object('error','budget'); end if;
 update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
 update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
 insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,state,reserved_microusd,pricing_version)
 values(p_user,p.id,'generation',j.id,j.input_hash,j.base_revision,'reserved',price.bound_microusd,price.pricing_version) returning * into op;
 update public.consultation_generation_jobs set status='running',operation_id=op.id,requirements='[]',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('job',public.consultation_generation_json(j),'operation',jsonb_build_object('id',op.id,'state',op.state),'created',true);
end $$;

create function public.finish_consultation_generation(p_user uuid,p_job uuid,p_input_hash text,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; j public.consultation_generation_jobs; checked jsonb; media_id uuid; image_size bigint;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into j from public.consultation_generation_jobs where id=p_job and user_id=p_user and profile_id=p.id for update;
 if j.id is null or j.base_revision is distinct from s.revision or j.input_hash is distinct from p_input_hash or (j.mode='prepared' and j.status<>'pending') or (j.mode='dynamic' and j.status<>'running') then return jsonb_build_object('error','conflict'); end if;
 if j.input_hash is distinct from public.style_input_hash(p.document,coalesce((select data from public.style_intakes where user_id=p_user and profile_id=p.id),'{}'::jsonb)) then return jsonb_build_object('error','conflict'); end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or p_result->>'assetPath' is null or p_result->>'documentRevision' is null or p_result->>'assetPath' not like p_user::text||'/%' or position('..' in p_result->>'assetPath')>0 or p_result->>'documentRevision' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','asset'); end if;
 if j.mode='dynamic' and not exists(select 1 from public.ai_operations where id=j.operation_id and user_id=p_user and profile_id=p.id and kind='generation' and state='running') then return jsonb_build_object('error','operation'); end if;
 if j.mode='dynamic' then
  begin media_id:=(p_result->>'mediaId')::uuid; image_size:=(p_result->>'byteSize')::bigint; exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','asset'); end;
  if media_id is null or image_size is null or image_size not between 1 and 10485760 or p_result->>'assetPath'<>p_user::text||'/generated/'||media_id::text or not exists(select 1 from public.upload_leases where id=media_id and user_id=p_user and object_path=p_result->>'assetPath' and expires_at>now()) then return jsonb_build_object('error','asset'); end if;
 end if;
 if j.action_id is not null then
  if j.mode='dynamic' then
   checked:=public.finish_consultation_action(p_user,j.action_id,j.operation_id,null,p_result->>'assetPath');
   if checked ? 'error' then return checked; end if;
  else
   update public.consultation_actions set status='succeeded',prepared_asset_path=p_result->>'assetPath',result='Explicitly prepared illustration; not regenerated from saved feedback.',updated_at=now()
   where id=j.action_id and user_id=p_user and kind='request_revision' and status='pending' and base_revision=s.revision;
   if not found then return jsonb_build_object('error','action'); end if;
  end if;
 end if;
 if j.mode='dynamic' then
  insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size,status) values(media_id,p_user,p.id,p_result->>'assetPath','style_look','image/png',image_size,'ready');
  delete from public.upload_leases where id=media_id and user_id=p_user;
 end if;
 update public.consultation_generation_jobs set status='succeeded',result=p_result,requirements='[]',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('job',public.consultation_generation_json(j),'consultation',public.read_consultation(p_user));
end $$;
revoke all on function public.consultation_generation_json(public.consultation_generation_jobs),public.create_consultation_generation(uuid,uuid,integer,text,text,text,uuid,text,boolean),public.start_consultation_generation(uuid,uuid,text),public.finish_consultation_generation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.consultation_generation_json(public.consultation_generation_jobs),public.create_consultation_generation(uuid,uuid,integer,text,text,text,uuid,text,boolean),public.start_consultation_generation(uuid,uuid,text),public.finish_consultation_generation(uuid,uuid,text,jsonb) to service_role;
