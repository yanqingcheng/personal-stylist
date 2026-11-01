-- Live transcripts are unpaired fragments. Only unfinished paired turns, or
-- active/uncertain Live work, prevent an action against the current revision.

create or replace function public.create_consultation_action(p_user uuid,p_id uuid,p_kind text,p_revision integer,p_output_id text,p_output_hash text,p_payload_hash text,p_feedback text default '')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; a public.consultation_actions; next_revision integer; approval jsonb;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into a from public.consultation_actions where id=p_id;
 if found then
  if a.user_id<>p_user or a.payload_hash<>p_payload_hash then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('action',public.consultation_action_json(a),'consultation',public.read_consultation(p_user),'replayed',true);
 end if;
 if p_kind not in ('reject_all','request_revision','approve','editorial') or p_id is null or p_output_id is null or length(p_output_id) not between 1 and 200 or p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or p_feedback is null or length(p_feedback)>12000 then return jsonb_build_object('error','invalid'); end if;
 if s.revision is distinct from p_revision then return jsonb_build_object('error','conflict'); end if;
 if exists(
  select 1 from public.consultation_live_sessions l
  join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id
  where l.user_id=p_user and (
   (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch')
   or o.state in ('reserved','running','uncertain')
  )
 ) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 if p_kind='editorial' and (s.approved_output_id is distinct from p_output_id or s.approved_output_hash is distinct from p_output_hash or s.approved_revision is distinct from s.revision) then return jsonb_build_object('error','approval'); end if;
 next_revision:=s.revision;
 if p_kind in ('reject_all','request_revision') then
  next_revision:=next_revision+1;
  update public.consultation_sessions set revision=next_revision,approved_output_id=null,approved_output_hash=null,approved_revision=null,updated_at=now() where user_id=p_user;
 elsif p_kind='approve' then
  approval:=public.approve_consultation_output(p_user,p_revision,p_output_id,p_output_hash);
  if approval ? 'error' then return approval; end if;
 end if;
 insert into public.consultation_actions(id,user_id,kind,status,requested_revision,base_revision,output_id,output_hash,payload_hash,feedback)
 values(p_id,p_user,p_kind,case when p_kind in ('reject_all','approve') then 'saved' else 'pending' end,p_revision,next_revision,p_output_id,p_output_hash,p_payload_hash,p_feedback) returning * into a;
 return jsonb_build_object('action',public.consultation_action_json(a),'consultation',public.read_consultation(p_user),'replayed',false);
end $$;

create or replace function public.claim_consultation_action(p_user uuid,p_action uuid,p_op uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; a public.consultation_actions; op public.ai_operations;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
 if a.id is null or op.id is null or op.state<>'running' or a.kind not in ('request_revision','editorial') or (a.kind='editorial' and op.kind<>'editorial') or (a.kind='request_revision' and op.kind<>'generation') then return jsonb_build_object('error','invalid'); end if;
 if (a.status<>'pending' and not (a.status='running' and a.operation_id=op.id)) or s.revision<>a.base_revision then return jsonb_build_object('error','conflict'); end if;
 if exists(
  select 1 from public.consultation_live_sessions l
  join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id
  where l.user_id=p_user and (
   (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch')
   or o.state in ('reserved','running','uncertain')
  )
 ) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 if a.kind='editorial' and (s.approved_output_id is distinct from a.output_id or s.approved_output_hash is distinct from a.output_hash or s.approved_revision is distinct from s.revision) then return jsonb_build_object('error','approval'); end if;
 if a.status='running' and a.operation_id=op.id then return jsonb_build_object('action',public.consultation_action_json(a),'replayed',true); end if;
 update public.consultation_actions set status='running',operation_id=op.id,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('action',public.consultation_action_json(a),'replayed',false);
end $$;

create or replace function public.start_consultation_editorial(p_user uuid,p_action uuid,p_key uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; a public.consultation_actions; reserved jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
 if a.id is null or a.kind<>'editorial' or a.status not in ('pending','running') or s.revision<>a.base_revision then return jsonb_build_object('error','conflict'); end if;
 if s.approved_output_id is distinct from a.output_id or s.approved_output_hash is distinct from a.output_hash or s.approved_revision is distinct from s.revision then return jsonb_build_object('error','approval'); end if;
 if exists(
  select 1 from public.consultation_live_sessions l
  join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id
  where l.user_id=p_user and (
   (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch')
   or o.state in ('reserved','running','uncertain')
  )
 ) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 reserved:=public.reserve_new_style_operation(p_user,p_key,p_hash,'editorial',a.base_revision,null);
 return reserved;
end $$;

create or replace function public.associate_prepared_consultation_action(p_user uuid,p_action uuid,p_revision integer,p_output_hash text,p_asset_path text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; a public.consultation_actions;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
 if a.id is null or a.kind<>'request_revision' or a.operation_id is not null or s.revision is distinct from p_revision or a.base_revision is distinct from p_revision or a.output_hash is distinct from p_output_hash then return jsonb_build_object('error','conflict'); end if;
 if p_asset_path is null or p_asset_path not like p_user::text||'/%' or position('..' in p_asset_path)>0 then return jsonb_build_object('error','asset'); end if;
 if a.status='succeeded' and a.prepared_asset_path=p_asset_path then return jsonb_build_object('action',public.consultation_action_json(a),'replayed',true); end if;
 if a.status<>'pending' or exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','conflict'); end if;
 if exists(
  select 1 from public.consultation_live_sessions l
  join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id
  where l.user_id=p_user and (
   (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch')
   or o.state in ('reserved','running','uncertain')
  )
 ) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 update public.consultation_actions set status='succeeded',prepared_asset_path=p_asset_path,result='Prepared image explicitly associated with this request. It was not generated from the new feedback.',updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('action',public.consultation_action_json(a),'consultation',public.read_consultation(p_user),'replayed',false);
end $$;

create or replace function public.start_consultation_generation(p_user uuid,p_job uuid,p_input_hash text)
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
 if exists(
  select 1 from public.consultation_live_sessions l
  join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id
  where l.user_id=p_user and (
   (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch')
   or o.state in ('reserved','running','uncertain')
  )
 ) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
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

-- Keep inspection separately attributable from planning and rendering.
alter table public.style_provider_usage drop constraint if exists style_provider_usage_action_check;
alter table public.style_provider_usage add constraint style_provider_usage_action_check
 check(action in ('plan','image','editorial','dialogue','composite','transcription','voice','inspection'));
