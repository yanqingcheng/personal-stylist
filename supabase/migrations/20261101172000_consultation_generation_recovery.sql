-- Privately authorized, explicit replacement only. An uncertain provider operation
-- and its full reservation remain unchanged; this is not a cancellation/refund.
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
create table public.consultation_generation_recoveries (
 old_job_id uuid primary key references public.consultation_generation_jobs(id),
 old_operation_id uuid not null unique references public.ai_operations(id),
 user_id uuid not null references public.access_grants(user_id),
 profile_id uuid not null references public.profiles(id),
 reason_code text not null check(reason_code='oversized_payload_no_saved_output'),
 authorized_at timestamptz not null default now(),
 new_job_id uuid unique,
 request jsonb,
 payload_hash text,
 claimed_at timestamptz,
 check((new_job_id is null and request is null and payload_hash is null and claimed_at is null) or
       (new_job_id is not null and request is not null and claimed_at is not null
        and payload_hash is not null and payload_hash ~ '^[a-f0-9]{64}$' and jsonb_typeof(request)='object' and octet_length(request::text)<=4000
        and request->>'idempotencyKey' is not null and request->>'idempotencyKey'=new_job_id::text and new_job_id<>old_job_id))
);
alter table public.consultation_generation_recoveries enable row level security;
revoke all on public.consultation_generation_recoveries from public,anon,authenticated;
grant all on public.consultation_generation_recoveries to service_role;

create function public.read_consultation_generation_recovery(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('recovery',(
  select jsonb_build_object('oldJobId',r.old_job_id,'heldMicrousd',o.reserved_microusd,
   'state',case when r.new_job_id is null then 'available' else 'claimed' end,
   'request',r.request,'newJobId',r.new_job_id)
  from public.consultation_generation_recoveries r
  join public.profiles p on p.id=r.profile_id and p.user_id=r.user_id and p.deletion_state='active'
  join public.access_grants g on g.user_id=r.user_id and g.active
  join public.consultation_generation_jobs j on j.id=r.old_job_id and j.user_id=r.user_id and j.profile_id=r.profile_id and j.operation_id=r.old_operation_id
  join public.ai_operations o on o.id=r.old_operation_id and o.user_id=r.user_id and o.profile_id=r.profile_id and o.kind='generation'
  where r.user_id=p_user and o.state='uncertain' and o.reserved_microusd>0 and o.settled_microusd=0
   and j.result is null and (j.status='uncertain' or (r.new_job_id is not null and j.status='failed'))
  order by r.authorized_at desc limit 1
 ))
$$;

create function public.claim_consultation_generation_recovery(p_user uuid,p_old uuid,p_request jsonb,p_payload_hash text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.consultation_generation_recoveries; p public.profiles; j public.consultation_generation_jobs; o public.ai_operations; s public.consultation_sessions; new_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden');end if;
 select * into r from public.consultation_generation_recoveries where old_job_id=p_old and user_id=p_user and profile_id=p.id for update;
 if r.old_job_id is null then return jsonb_build_object('error','unavailable');end if;
 select * into j from public.consultation_generation_jobs where id=p_old and user_id=p_user and profile_id=p.id for update;
 select * into o from public.ai_operations where id=r.old_operation_id and user_id=p_user and profile_id=p.id for update;
 if j.id is null or j.operation_id is distinct from o.id or o.kind<>'generation' or o.state<>'uncertain' or o.reserved_microusd<=0 or o.settled_microusd<>0 or j.result is not null then return jsonb_build_object('error','unavailable');end if;
 if r.new_job_id is not null then
  if r.request is distinct from p_request or r.payload_hash is distinct from p_payload_hash then return jsonb_build_object('error','claimed')||public.read_consultation_generation_recovery(p_user);end if;
  return jsonb_build_object('replayed',true)||public.read_consultation_generation_recovery(p_user);
 end if;
 if j.status<>'uncertain' or p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>4000
  or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
  or p_request->>'mode' is distinct from 'dynamic' or p_request->'adultConfirmed' is distinct from 'true'::jsonb then return jsonb_build_object('error','invalid');end if;
 begin new_id:=(p_request->>'idempotencyKey')::uuid;exception when invalid_text_representation then return jsonb_build_object('error','invalid');end;
 if new_id is null or new_id=p_old or exists(select 1 from public.consultation_generation_jobs where id=new_id) or exists(select 1 from public.consultation_generation_recoveries where new_job_id=new_id) then return jsonb_build_object('error','conflict');end if;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if s.user_id is null or p_request->>'expectedRevision' is distinct from s.revision::text then return jsonb_build_object('error','conflict');end if;
 update public.consultation_generation_recoveries set new_job_id=new_id,request=p_request,payload_hash=p_payload_hash,claimed_at=now() where old_job_id=p_old;
 update public.consultation_generation_jobs set status='failed',requirements=jsonb_build_array('Superseded by your explicitly requested replacement. The earlier provider outcome remains uncertain and its full allowance reservation is still held.'),updated_at=now() where id=p_old;
 return jsonb_build_object('replayed',false)||public.read_consultation_generation_recovery(p_user);
end $$;

-- Change exactly the in-flight predicate, retaining every existing ledger,
-- account, global ceiling, protected-account, adult and source guard.
do $patch$ declare definition text; old_predicate text := 'if exists(select 1 from public.ai_operations where user_id=p_user and state in (''reserved'',''running'',''uncertain'')) then return jsonb_build_object(''error'',''in_flight''); end if;'; new_predicate text := 'if exists(select 1 from public.ai_operations active_op where active_op.user_id=p_user and active_op.state in (''reserved'',''running'',''uncertain'') and not (active_op.state=''uncertain'' and exists(select 1 from public.consultation_generation_recoveries recovery join public.consultation_generation_jobs old_job on old_job.id=recovery.old_job_id and old_job.user_id=recovery.user_id and old_job.profile_id=recovery.profile_id and old_job.operation_id=recovery.old_operation_id where recovery.user_id=p_user and recovery.profile_id=p.id and recovery.new_job_id=p_job and recovery.payload_hash=j.payload_hash and recovery.old_operation_id=active_op.id and recovery.claimed_at is not null and recovery.request->>''idempotencyKey''=p_job::text and old_job.status=''failed'' and old_job.result is null and active_op.kind=''generation'' and active_op.profile_id=p.id and active_op.reserved_microusd>0 and active_op.settled_microusd=0))) then return jsonb_build_object(''error'',''in_flight''); end if;';
begin
 definition:=pg_get_functiondef('public.start_consultation_generation(uuid,uuid,text)'::regprocedure);
 if (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate)<>1
  or position('style_funds_preserve_protected_accounts' in definition)=0 or position('total_limit_microusd>100000000' in definition)=0
  or position('pg_advisory_xact_lock(hashtextextended(''style-ledger'',0))' in definition)=0 then raise exception 'Recovery patch requires current protected generation adapter';end if;
 execute replace(definition,old_predicate,new_predicate);
end $patch$;
revoke all on function public.read_consultation_generation_recovery(uuid),public.claim_consultation_generation_recovery(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.read_consultation_generation_recovery(uuid),public.claim_consultation_generation_recovery(uuid,uuid,jsonb,text) to service_role;
commit;
