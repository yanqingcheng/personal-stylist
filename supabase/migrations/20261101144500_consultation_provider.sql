-- Add provider-backed turns without enabling prices or making any API call.
alter table public.style_price_bounds drop constraint style_price_bounds_kind_check;
alter table public.style_price_bounds add constraint style_price_bounds_kind_check check(kind in ('generation','editorial','dialogue','voice'));
alter table public.consultation_messages drop constraint consultation_messages_source_check;
alter table public.consultation_messages drop constraint consultation_messages_check;
alter table public.consultation_messages add column provider_operation_id uuid references public.ai_operations(id);
alter table public.consultation_messages add column provider_model text;
alter table public.consultation_messages add column provider_model_source text check(provider_model_source is null or provider_model_source in ('reported','requested'));
alter table public.consultation_messages add constraint consultation_messages_source_check check(source in ('user','native-codex','api'));
alter table public.consultation_messages add constraint consultation_messages_check check(
 (role='user' and source='user' and reply_to is null) or
 (role='stylist' and source in ('native-codex','api') and reply_to is not null and (source<>'api' or provider_operation_id is not null))
);

create function public.reserve_consultation_operation(p_user uuid,p_key uuid,p_hash text,p_revision integer,p_reply_to uuid,p_mode text default 'text')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; g public.access_grants; b public.budget_control; pool public.budget_pools;
 price public.style_price_bounds; op public.ai_operations; s public.consultation_sessions; requested_kind text;
begin
 if p_mode not in ('text','voice') then return jsonb_build_object('error','invalid'); end if;
 requested_kind:=case when p_mode='voice' then 'voice' else 'dialogue' end;
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into g from public.access_grants where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
 select * into op from public.ai_operations where user_id=p_user and idempotency_key=p_key;
 if found then
  if op.payload_hash<>p_hash or op.kind<>requested_kind or op.client_request_id is distinct from p_reply_to or op.base_revision<>p_revision then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('created',false,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state));
 end if;
 if p_key is null or p_reply_to is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_revision is null or p_revision<0 then return jsonb_build_object('error','invalid'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if s.revision<>p_revision then return jsonb_build_object('error','conflict'); end if;
 if exists(select 1 from public.consultation_messages where id=p_reply_to and (user_id<>p_user or role<>'user')) then return jsonb_build_object('error','invalid'); end if;
 if p_mode='text' and not exists(select 1 from public.consultation_messages where id=p_reply_to and user_id=p_user and role='user') then return jsonb_build_object('error','invalid'); end if;
 if exists(select 1 from public.consultation_messages where reply_to=p_reply_to) then return jsonb_build_object('error','answered'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','in_flight'); end if;
 select * into b from public.budget_control where id=true for update;
 select * into pool from public.budget_pools where cohort=g.cohort for update;
 select * into price from public.style_price_bounds where kind=requested_kind and enabled;
 -- Same admission rules and counters as image/editorial operations; voice/text
 -- prices must be supplied and enabled by the operator after verification.
 if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null or b.total_limit_microusd>50000000 or b.total_limit_microusd<0 or b.reserved_microusd<0 or b.spent_microusd<0 or pool.limit_microusd<0 or pool.reserved_microusd<0 or pool.spent_microusd<0 or g.allowance_microusd<0 or g.reserved_microusd<0 or g.spent_microusd<0 or g.editorial_hold_microusd<0 or (select limit_microusd from public.budget_pools where cohort='development')>5000000 or (select sum(limit_microusd) from public.budget_pools)>b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
 if price.bound_microusd>b.total_limit_microusd-b.spent_microusd-b.reserved_microusd or price.bound_microusd>pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd or price.bound_microusd>g.allowance_microusd-g.spent_microusd-g.reserved_microusd-g.editorial_hold_microusd then return jsonb_build_object('error','budget'); end if;
 update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
 update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
 insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,client_request_id,state,reserved_microusd,pricing_version)
 values(p_user,p.id,requested_kind,p_key,p_hash,p_revision,p_reply_to,'reserved',price.bound_microusd,price.pricing_version) returning * into op;
 return jsonb_build_object('created',true,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state));
end $$;

create function public.append_provider_reply(p_user uuid,p_op uuid,p_reply_to uuid,p_revision integer,p_text text,p_user_text text default null,p_board text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; op public.ai_operations; target public.consultation_messages;
 previous public.consultation_messages; next_revision integer; usage_model text; usage_model_source text;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
 if s.user_id is null or op.id is null or op.kind not in ('dialogue','voice') or op.client_request_id is distinct from p_reply_to or op.base_revision<>p_revision then return jsonb_build_object('error','invalid'); end if;
 select * into previous from public.consultation_messages where reply_to=p_reply_to;
 if found then
  if previous.user_id=p_user and previous.source='api' and previous.provider_operation_id=op.id and previous.text=p_text and (p_user_text is null or exists(select 1 from public.consultation_messages where id=p_reply_to and user_id=p_user and text=p_user_text)) then return jsonb_build_object('replayed',true,'consultation',public.read_consultation(p_user)); end if;
  return jsonb_build_object('error','conflict');
 end if;
 if op.state<>'running' or s.revision<>p_revision then return jsonb_build_object('error','conflict'); end if;
 if p_text is null or length(btrim(p_text))=0 or length(p_text)>20000 or (p_board is not null and length(p_board) not between 1 and 200) then return jsonb_build_object('error','invalid'); end if;
 select * into target from public.consultation_messages where id=p_reply_to for update;
 next_revision:=s.revision;
 if found then
  if target.user_id<>p_user or target.role<>'user' or (p_user_text is not null and target.text<>p_user_text) then return jsonb_build_object('error','invalid'); end if;
 else
  if op.kind<>'voice' or p_user_text is null or length(btrim(p_user_text))=0 or length(p_user_text)>12000 then return jsonb_build_object('error','invalid'); end if;
  next_revision:=next_revision+1;
  insert into public.consultation_messages(id,user_id,role,source,text,revision,active_board_id,provider_operation_id)
  values(p_reply_to,p_user,'user','user',p_user_text,next_revision,p_board,op.id) returning * into target;
 end if;
 select model,model_source into usage_model,usage_model_source from public.style_provider_usage where operation_id=op.id and user_id=p_user and action in ('dialogue','voice') order by created_at desc limit 1;
 next_revision:=next_revision+1;
 insert into public.consultation_messages(user_id,role,source,text,reply_to,revision,active_board_id,provider_operation_id,provider_model,provider_model_source)
 values(p_user,'stylist','api',p_text,target.id,next_revision,target.active_board_id,op.id,usage_model,usage_model_source);
 update public.consultation_sessions set revision=next_revision,approved_output_id=null,approved_output_hash=null,approved_revision=null,updated_at=now() where user_id=p_user;
 return jsonb_build_object('replayed',false,'consultation',public.read_consultation(p_user));
end $$;
revoke all on function public.reserve_consultation_operation(uuid,uuid,text,integer,uuid,text),public.append_provider_reply(uuid,uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_consultation_operation(uuid,uuid,text,integer,uuid,text),public.append_provider_reply(uuid,uuid,uuid,integer,text,text,text) to service_role;
