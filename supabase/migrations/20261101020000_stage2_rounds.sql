-- Additional private data for immutable style proposals and their explicit approval.
create table public.style_round_details (
  round_id uuid primary key references public.rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  plan jsonb not null,
  approved_hash text,
  editorial text,
  updated_at timestamptz not null default now()
);
alter table public.style_round_details enable row level security;
revoke all on public.style_round_details from public, anon, authenticated;
grant all on public.style_round_details to service_role;

-- Call with the locked current profile/intake. JSONB's canonical representation
-- makes key order irrelevant. User content stays inside the digest, not logs.
create function public.style_input_hash(p_document jsonb,p_intake jsonb) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
  select encode(extensions.digest(convert_to(jsonb_build_object('profile',p_document,'intake',p_intake)::text,'UTF8'),'sha256'),'hex')
$$;
revoke all on function public.style_input_hash(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.style_input_hash(jsonb,jsonb) to service_role;

create function public.save_style_feedback(p_user uuid,p_round uuid,p_feedback text,p_approve boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; i public.style_intakes; r public.rounds; d public.style_round_details; current_hash text;
begin
  select * into p from public.profiles where user_id=p_user for update;
  if not found or p.deletion_state <> 'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
  select * into i from public.style_intakes where user_id=p_user for update;
  select * into r from public.rounds where id=p_round and user_id=p_user and profile_id=p.id for update;
  if not found or r.status <> 'succeeded' or coalesce(array_length(r.media_ids,1),0)=0 or exists(select 1 from unnest(r.media_ids) x where not exists(select 1 from public.media m where m.id=x and m.user_id=p_user and m.profile_id=p.id and m.status='ready')) then return jsonb_build_object('error','unavailable'); end if;
  select * into d from public.style_round_details where round_id=r.id and user_id=p_user for update;
  if not found or i.user_id is null then return jsonb_build_object('error','unavailable'); end if;
  current_hash:=public.style_input_hash(p.document,i.data);
  if current_hash <> d.input_hash then return jsonb_build_object('error','stale'); end if;
  if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','in_flight'); end if;
  if length(p_feedback)>8000 then return jsonb_build_object('error','invalid'); end if;
  if p_feedback <> '' then update public.rounds set feedback=to_jsonb(p_feedback) where id=r.id; end if;
  update public.style_round_details set approved_hash=case when p_approve then current_hash else null end,editorial=null,updated_at=now() where round_id=r.id;
  return jsonb_build_object('ok',true,'approved',p_approve);
end $$;
revoke all on function public.save_style_feedback(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.save_style_feedback(uuid,uuid,text,boolean) to service_role;

create function public.read_style_rounds(p_user uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'parentRoundId',r.parent_round_id,'status',r.status,
   'feedback',case when jsonb_typeof(r.feedback)='string' then r.feedback #>> '{}' else null end,
   'looks',coalesce((select jsonb_agg(jsonb_build_object('mediaId',m)) from unnest(r.media_ids) m),'[]'::jsonb),
   'approved',coalesce(d.approved_hash is not null and d.approved_hash=public.style_input_hash(p.document,i.data),false),
   'editorial',case when d.approved_hash is not null and d.approved_hash=public.style_input_hash(p.document,i.data) then d.editorial else null end,
   'createdAt',r.created_at) order by r.created_at),'[]'::jsonb)
 from public.profiles p join public.style_intakes i on i.user_id=p.user_id
 join public.rounds r on r.profile_id=p.id and r.user_id=p.user_id
 left join public.style_round_details d on d.round_id=r.id and d.user_id=p.user_id
 where p.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
$$;
revoke all on function public.read_style_rounds(uuid) from public,anon,authenticated;
grant execute on function public.read_style_rounds(uuid) to service_role;

-- Persistence functions recheck active profile and the exact approved input under
-- a row lock, so deletion or edits cannot resurrect private results.
create function public.save_style_plan(p_user uuid,p_op uuid,p_parent uuid,p_input_hash text,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; i public.style_intakes; o public.ai_operations; r public.rounds;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' then return jsonb_build_object('error','unavailable'); end if;
 select * into i from public.style_intakes where user_id=p_user for update;
 select * into o from public.ai_operations where id=p_op and user_id=p_user for update;
 if i.user_id is null or o.id is null or o.state<>'running' or o.kind<>'generation' or o.round_id is distinct from p_parent or public.style_input_hash(p.document,i.data)<>p_input_hash then return jsonb_build_object('error','stale'); end if;
 insert into public.rounds(user_id,profile_id,parent_round_id,base_revision,status,hypothesis) values(p_user,p.id,p_parent,i.revision,'planning',p_plan) returning * into r;
 insert into public.style_round_details(round_id,user_id,input_hash,plan) values(r.id,p_user,p_input_hash,p_plan);
 update public.ai_operations set round_id=r.id,updated_at=now() where id=o.id;
 return jsonb_build_object('roundId',r.id);
end $$;

create function public.finish_style_image(p_user uuid,p_op uuid,p_round uuid,p_media uuid,p_path text,p_size bigint)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; i public.style_intakes; d public.style_round_details; o public.ai_operations;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' then return false; end if;
 select * into i from public.style_intakes where user_id=p_user for update;
 select * into o from public.ai_operations where id=p_op and user_id=p_user for update;
 select * into d from public.style_round_details where round_id=p_round and user_id=p_user for update;
 if i.user_id is null or o.id is null or d.round_id is null or o.round_id is distinct from p_round or o.state<>'running' or public.style_input_hash(p.document,i.data)<>d.input_hash or p_size<=0 or p_size>10485760 or p_path<>p_user::text||'/generated/'||p_media::text then return false; end if;
 insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size,status) values(p_media,p_user,p.id,p_path,'style_look','image/png',p_size,'ready');
 update public.rounds set status='succeeded',media_ids=array[p_media] where id=p_round and user_id=p_user and status='planning';
 if not found then raise exception 'round unavailable'; end if;
 return true;
end $$;

create function public.finish_style_editorial(p_user uuid,p_op uuid,p_round uuid,p_text text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; i public.style_intakes; d public.style_round_details; o public.ai_operations;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' then return false; end if;
 select * into i from public.style_intakes where user_id=p_user for update;
 select * into o from public.ai_operations where id=p_op and user_id=p_user for update;
 select * into d from public.style_round_details where round_id=p_round and user_id=p_user for update;
 if i.user_id is null or o.id is null or d.round_id is null or o.round_id is distinct from p_round or o.kind<>'editorial' or o.state<>'running' or d.approved_hash is null or d.approved_hash<>public.style_input_hash(p.document,i.data) or length(p_text)=0 or length(p_text)>20000 then return false; end if;
 update public.style_round_details set editorial=p_text,updated_at=now() where round_id=p_round;
 return true;
end $$;
revoke all on function public.save_style_plan(uuid,uuid,uuid,text,jsonb),public.finish_style_image(uuid,uuid,uuid,uuid,text,bigint),public.finish_style_editorial(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_style_plan(uuid,uuid,uuid,text,jsonb),public.finish_style_image(uuid,uuid,uuid,uuid,text,bigint),public.finish_style_editorial(uuid,uuid,uuid,text) to service_role;

create function public.reserve_new_style_operation(p_user uuid,p_key uuid,p_hash text,p_kind text,p_revision integer,p_round uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare existed boolean; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select exists(select 1 from public.ai_operations where user_id=p_user and idempotency_key=p_key) into existed;
 result:=public.reserve_style_operation(p_user,p_key,p_hash,p_kind,p_revision,p_round);
 return result || jsonb_build_object('created',not existed and result ? 'operation');
end $$;
create function public.mark_style_uncertain(p_user uuid,p_op uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 update public.ai_operations set state='uncertain',updated_at=now() where id=p_op and user_id=p_user and state='running';
end $$;
revoke all on function public.reserve_new_style_operation(uuid,uuid,text,text,integer,uuid),public.mark_style_uncertain(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_new_style_operation(uuid,uuid,text,text,integer,uuid),public.mark_style_uncertain(uuid,uuid) to service_role;

-- Retain the path even across a crash or late upload. Profile deletion must not
-- finish until the lease expires and its path has been removed from Storage.
create function public.lease_style_upload(p_user uuid,p_op uuid,p_media uuid,p_path text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or p_path<>p_user::text||'/generated/'||p_media::text or not exists(select 1 from public.ai_operations where id=p_op and user_id=p_user and state='running' and kind='generation') then return false; end if;
 insert into public.upload_leases(id,user_id,object_path,expires_at) values(p_media,p_user,p_path,now()+interval '2 hours 5 minutes');
 return true;
end $$;
revoke all on function public.lease_style_upload(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.lease_style_upload(uuid,uuid,uuid,text) to service_role;
