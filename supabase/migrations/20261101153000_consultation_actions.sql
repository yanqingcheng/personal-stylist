create table public.consultation_actions(
 id uuid primary key,
 user_id uuid not null references public.consultation_sessions(user_id) on delete cascade,
 kind text not null check(kind in ('reject_all','request_revision','approve','editorial')),
 status text not null check(status in ('saved','pending','running','succeeded','failed','uncertain')),
 requested_revision integer not null,
 base_revision integer not null,
 output_id text not null check(length(output_id) between 1 and 200),
 output_hash text not null check(output_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 feedback text not null default '' check(length(feedback)<=12000),
 operation_id uuid references public.ai_operations(id),
 prepared_asset_path text,
 result text check(result is null or length(result)<=20000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.consultation_actions enable row level security;
revoke all on public.consultation_actions from public,anon,authenticated;
grant all on public.consultation_actions to service_role;
create function public.consultation_action_json(a public.consultation_actions) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'baseRevision',a.base_revision,'requestedRevision',a.requested_revision,'outputId',a.output_id,'outputHash',a.output_hash,'feedback',a.feedback,'operationId',a.operation_id,'assetPath',a.prepared_asset_path,'result',a.result,'createdAt',a.created_at)
$$;
create function public.read_consultation_actions(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.consultation_action_json(a) order by a.created_at),'[]'::jsonb)
 from public.consultation_actions a join public.profiles p on p.user_id=a.user_id
 where a.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
$$;
create function public.create_consultation_action(p_user uuid,p_id uuid,p_kind text,p_revision integer,p_output_id text,p_output_hash text,p_payload_hash text,p_feedback text default '')
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
 if exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
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
create function public.claim_consultation_action(p_user uuid,p_action uuid,p_op uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; a public.consultation_actions; op public.ai_operations;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
 select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
 if a.id is null or op.id is null or op.state<>'running' or a.kind not in ('request_revision','editorial') or (a.kind='editorial' and op.kind<>'editorial') or (a.kind='request_revision' and op.kind<>'generation') then return jsonb_build_object('error','invalid'); end if;
 if a.status='running' and a.operation_id=op.id then return jsonb_build_object('action',public.consultation_action_json(a),'replayed',true); end if;
 if a.status<>'pending' or s.revision<>a.base_revision then return jsonb_build_object('error','conflict'); end if;
 if exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 if a.kind='editorial' and (s.approved_output_id is distinct from a.output_id or s.approved_output_hash is distinct from a.output_hash or s.approved_revision is distinct from s.revision) then return jsonb_build_object('error','approval'); end if;
 update public.consultation_actions set status='running',operation_id=op.id,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('action',public.consultation_action_json(a),'replayed',false);
end $$;
create function public.start_consultation_editorial(p_user uuid,p_action uuid,p_key uuid,p_hash text) returns jsonb
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
 if exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending'); end if;
 reserved:=public.reserve_new_style_operation(p_user,p_key,p_hash,'editorial',a.base_revision,null);
 return reserved;
end $$;
create function public.finish_consultation_action(p_user uuid,p_action uuid,p_op uuid,p_result text default null,p_asset_path text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare checked jsonb; a public.consultation_actions; s public.consultation_sessions;
begin
 checked:=public.claim_consultation_action(p_user,p_action,p_op);
 if checked ? 'error' then return checked; end if;
 select * into a from public.consultation_actions where id=p_action and user_id=p_user for update;
 select * into s from public.consultation_sessions where user_id=p_user for update;
 if s.revision<>a.base_revision then return jsonb_build_object('error','conflict'); end if;
 if a.kind='editorial' and (s.approved_output_id is distinct from a.output_id or s.approved_output_hash is distinct from a.output_hash or s.approved_revision is distinct from s.revision) then return jsonb_build_object('error','approval'); end if;
 if a.kind='editorial' and (p_result is null or length(btrim(p_result))=0 or length(p_result)>20000) then return jsonb_build_object('error','invalid'); end if;
 if a.kind='request_revision' and (p_asset_path is null or p_asset_path not like p_user::text||'/%' or position('..' in p_asset_path)>0) then return jsonb_build_object('error','asset'); end if;
 update public.consultation_actions set status='succeeded',result=p_result,prepared_asset_path=p_asset_path,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('action',public.consultation_action_json(a),'consultation',public.read_consultation(p_user));
end $$;
revoke all on function public.consultation_action_json(public.consultation_actions),public.read_consultation_actions(uuid),public.create_consultation_action(uuid,uuid,text,integer,text,text,text,text),public.claim_consultation_action(uuid,uuid,uuid),public.start_consultation_editorial(uuid,uuid,uuid,text),public.finish_consultation_action(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.consultation_action_json(public.consultation_actions),public.read_consultation_actions(uuid),public.create_consultation_action(uuid,uuid,text,integer,text,text,text,text),public.claim_consultation_action(uuid,uuid,uuid),public.start_consultation_editorial(uuid,uuid,uuid,text),public.finish_consultation_action(uuid,uuid,uuid,text,text) to service_role;
