-- Live is admitted through the existing USD50 ledger. No price is invented or enabled.
alter table public.style_price_bounds drop constraint style_price_bounds_kind_check;
alter table public.style_price_bounds add constraint style_price_bounds_kind_check check(kind in ('generation','editorial','composite','dialogue','voice','live'));
update public.style_price_bounds set enabled=false where kind='live';
create table public.consultation_live_sessions(
 operation_id uuid primary key,
 user_id uuid not null references auth.users(id),
 sdp_answer text check(sdp_answer is null or length(sdp_answer)<=100000),
 provider_session_id text unique check(provider_session_id is null or provider_session_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
 status text not null default 'waiting' check(status in ('waiting','monitoring','closed','uncertain')),
 -- Conservative server reservation time, not a claim of provider-billed duration.
 started_at timestamptz not null default clock_timestamp(),
 final_seconds numeric check(final_seconds>=0 and final_seconds<='86400'::numeric),
 close_reason text check(close_reason is null or length(close_reason)<=500),
 backend_usage jsonb not null default '[]'::jsonb check(jsonb_typeof(backend_usage)='array' and jsonb_array_length(backend_usage)<=3 and octet_length(backend_usage::text)<=16384),
 foreign key(operation_id,user_id) references public.ai_operations(id,user_id) on delete cascade
);
alter table public.consultation_live_sessions enable row level security;
revoke all on public.consultation_live_sessions from public,anon,authenticated;
grant all on public.consultation_live_sessions to service_role;

alter table public.consultation_messages add column live_operation_id uuid references public.consultation_live_sessions(operation_id);
alter table public.consultation_messages add column live_event_id text;
alter table public.consultation_messages add column start_ms integer;
alter table public.consultation_messages add column end_ms integer;
create unique index consultation_live_event on public.consultation_messages(live_operation_id,live_event_id) where live_operation_id is not null;
alter table public.consultation_messages drop constraint consultation_messages_check;
alter table public.consultation_messages add constraint consultation_messages_check check(
 (live_operation_id is null and live_event_id is null and start_ms is null and end_ms is null and (
  (role='user' and source='user' and reply_to is null) or
  (role='stylist' and source in ('native-codex','api') and reply_to is not null and (source<>'api' or provider_operation_id is not null))))
 or (live_operation_id is not null and live_event_id is not null and length(live_event_id) between 1 and 200
  and provider_operation_id is not null and provider_operation_id=live_operation_id and reply_to is null
  and ((role='user' and source='user') or (role='stylist' and source='api'))
  and ((start_ms is null and end_ms is null) or (start_ms is not null and end_ms is not null and start_ms>=0 and end_ms>=start_ms)))
);

create function public.reserve_live_consultation(p_user uuid,p_key uuid,p_hash text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; g public.access_grants; b public.budget_control; pool public.budget_pools;
 price public.style_price_bounds; op public.ai_operations; s public.consultation_sessions;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into g from public.access_grants where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
 select * into op from public.ai_operations where user_id=p_user and idempotency_key=p_key;
 if found then
  if op.payload_hash is distinct from p_hash or op.kind<>'live' or op.base_revision is distinct from p_revision then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('created',false,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state));
 end if;
 if p_key is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_revision is null or p_revision<0 then return jsonb_build_object('error','invalid'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if s.revision<>p_revision then return jsonb_build_object('error','conflict'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running','uncertain')) then return jsonb_build_object('error','in_flight'); end if;
 select * into b from public.budget_control where id=true for update;
 select * into pool from public.budget_pools where cohort=g.cohort for update;
 select * into price from public.style_price_bounds where kind='live' and enabled;
 if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null or b.total_limit_microusd>50000000 or b.total_limit_microusd<0 or b.reserved_microusd<0 or b.spent_microusd<0 or pool.limit_microusd<0 or pool.reserved_microusd<0 or pool.spent_microusd<0 or g.allowance_microusd<0 or g.reserved_microusd<0 or g.spent_microusd<0 or g.editorial_hold_microusd<0 or (select limit_microusd from public.budget_pools where cohort='development')>5000000 or (select sum(limit_microusd) from public.budget_pools)>b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
 if price.bound_microusd>b.total_limit_microusd-b.spent_microusd-b.reserved_microusd or price.bound_microusd>pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd or price.bound_microusd>g.allowance_microusd-g.spent_microusd-g.reserved_microusd-g.editorial_hold_microusd then return jsonb_build_object('error','budget'); end if;
 update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
 update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
 insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,state,reserved_microusd,pricing_version)
 values(p_user,p.id,'live',p_key,p_hash,p_revision,'reserved',price.bound_microusd,price.pricing_version) returning * into op;
 insert into public.consultation_live_sessions(operation_id,user_id) values(op.id,p_user);
 return jsonb_build_object('created',true,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state));
end $$;

create function public.bind_live_consultation(p_user uuid,p_op uuid,p_session text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; op public.ai_operations; live public.consultation_live_sessions;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
 select * into live from public.consultation_live_sessions where operation_id=p_op and user_id=p_user for update;
 if op.id is null or op.kind<>'live' or op.state<>'running' or live.operation_id is null or live.status<>'waiting' or p_session is null or p_session !~ '^[A-Za-z0-9_.:-]{1,200}$' then return jsonb_build_object('error','invalid'); end if;
 if live.provider_session_id is not null and live.provider_session_id<>p_session then return jsonb_build_object('error','conflict'); end if;
 update public.consultation_live_sessions set provider_session_id=p_session where operation_id=p_op returning * into live;
 return jsonb_build_object('bound',true,'session',jsonb_build_object('operationId',p_op,'providerSessionId',live.provider_session_id,'startedAt',live.started_at,'status',live.status));
exception when unique_violation then return jsonb_build_object('error','conflict');
end $$;

create function public.claim_live_monitor(p_user uuid,p_op uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; op public.ai_operations; live public.consultation_live_sessions;
begin
 select * into p from public.profiles where user_id=p_user and deletion_state='active' for update;
 if not found or not exists(select 1 from public.access_grants where user_id=p_user and active) then return null; end if;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id and kind='live' and state='running' for update;
 if not found then return null; end if;
 update public.consultation_live_sessions set status='monitoring'
 where operation_id=p_op and user_id=p_user and status='waiting' and provider_session_id is not null returning * into live;
 if not found then return null; end if;
 return jsonb_build_object('id',p_op,'providerSessionId',live.provider_session_id,'startedAt',live.started_at);
end $$;

create function public.append_live_fragment(p_user uuid,p_op uuid,p_event text,p_role text,p_delta text,p_start integer,p_end integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; op public.ai_operations; live public.consultation_live_sessions; previous public.consultation_messages;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
 select * into live from public.consultation_live_sessions where operation_id=p_op and user_id=p_user for update;
 if s.user_id is null or op.kind is distinct from 'live' or live.operation_id is null then return jsonb_build_object('error','invalid'); end if;
 select * into previous from public.consultation_messages where live_operation_id=p_op and live_event_id=p_event;
 if found then
  if previous.user_id=p_user and previous.role=p_role and previous.text=p_delta and previous.start_ms is not distinct from p_start and previous.end_ms is not distinct from p_end then return jsonb_build_object('replayed',true,'consultation',public.read_consultation(p_user)); end if;
  return jsonb_build_object('error','conflict');
 end if;
 if op.state<>'running' or live.status<>'monitoring' then return jsonb_build_object('error','conflict'); end if;
 if p_event is null or length(p_event) not between 1 and 200 or p_role is null or p_role not in ('user','stylist') or p_delta is null or length(p_delta) not between 1 and 20000 or not ((p_start is null and p_end is null) or (p_start is not null and p_end is not null and p_start>=0 and p_end>=p_start)) then return jsonb_build_object('error','invalid'); end if;
 insert into public.consultation_messages(user_id,role,source,text,revision,provider_operation_id,live_operation_id,live_event_id,start_ms,end_ms)
 values(p_user,p_role,case when p_role='user' then 'user' else 'api' end,p_delta,s.revision+1,p_op,p_op,p_event,p_start,p_end);
 update public.consultation_sessions set revision=revision+1,approved_output_id=null,approved_output_hash=null,approved_revision=null,updated_at=now() where user_id=p_user;
 return jsonb_build_object('replayed',false,'consultation',public.read_consultation(p_user));
end $$;

-- Fragments are evidence in their own right, not invented paired chat turns.
create or replace function public.read_consultation(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'revision',coalesce(s.revision,0),'approvedOutputId',s.approved_output_id,'approvedOutputHash',s.approved_output_hash,
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'source',m.source,'text',m.text,'replyTo',m.reply_to,'activeBoardId',m.active_board_id,'createdAt',m.created_at,'liveOperationId',m.live_operation_id,'liveEventId',m.live_event_id,'startMs',m.start_ms,'endMs',m.end_ms) order by m.revision) from public.consultation_messages m where m.user_id=p_user),'[]'::jsonb),
  'pendingReplyTo',(select m.id from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user) order by m.revision limit 1),
  'pendingCount',(select count(*) from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)),
  'status',case when exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then 'awaiting-native-reply' else 'ready' end,
  'liveSessions',coalesce((select jsonb_agg(jsonb_build_object('operationId',l.operation_id,'status',l.status,'startedAt',l.started_at,'finalSeconds',l.final_seconds,'closeReason',l.close_reason) order by l.started_at) from public.consultation_live_sessions l where l.user_id=p_user),'[]'::jsonb)
 ) from public.profiles p left join public.consultation_sessions s on s.user_id=p.user_id and s.profile_id=p.id
 where p.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
$$;
create or replace function public.read_pending_consultation(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'text',m.text,'activeBoardId',m.active_board_id,'createdAt',m.created_at) order by m.revision),'[]'::jsonb)
 from public.consultation_messages m join public.profiles p on p.user_id=m.user_id
 where m.user_id=p_user and m.role='user' and m.live_operation_id is null and p.deletion_state='active'
 and exists(select 1 from public.access_grants where user_id=p_user and active)
 and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)
$$;
create or replace function public.approve_consultation_output(p_user uuid,p_revision integer,p_output_id text,p_output_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if p_revision is distinct from s.revision then return jsonb_build_object('error','conflict','consultation',public.read_consultation(p_user)); end if;
 if exists(select 1 from public.consultation_live_sessions l join public.ai_operations o on o.id=l.operation_id and o.user_id=l.user_id where l.user_id=p_user and (l.status in ('waiting','monitoring','uncertain') and o.state<>'failed_before_dispatch' or o.state in ('reserved','running','uncertain'))) or exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and m.live_operation_id is null and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending','consultation',public.read_consultation(p_user)); end if;
 if p_output_id is null or length(p_output_id) not between 1 and 200 or p_output_hash is null or p_output_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid'); end if;
 update public.consultation_sessions set approved_output_id=p_output_id,approved_output_hash=p_output_hash,approved_revision=revision,updated_at=now() where user_id=p_user;
 return jsonb_build_object('consultation',public.read_consultation(p_user),'approved',true);
end $$;
revoke all on function public.reserve_live_consultation(uuid,uuid,text,integer),public.bind_live_consultation(uuid,uuid,text),public.claim_live_monitor(uuid,uuid),public.append_live_fragment(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_live_consultation(uuid,uuid,text,integer),public.bind_live_consultation(uuid,uuid,text),public.claim_live_monitor(uuid,uuid),public.append_live_fragment(uuid,uuid,text,text,text,integer,integer) to service_role;
