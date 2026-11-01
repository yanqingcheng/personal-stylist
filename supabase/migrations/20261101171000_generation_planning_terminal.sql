-- Future-only provider-phase evidence. Legacy NULL is unknown, never proof of no image call.
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
alter table public.consultation_generation_jobs
 add column provider_phase text check(provider_phase in ('planning','image-started','planning-terminal')),
 add column image_dispatch_started_at timestamptz,
 add column planning_terminal_code text check(planning_terminal_code in ('needs_evidence','invalid_plan')),
 add constraint consultation_generation_phase_proof check(case
  when provider_phase is null then image_dispatch_started_at is null and planning_terminal_code is null
  when provider_phase='planning' then image_dispatch_started_at is null and planning_terminal_code is null
  when provider_phase='image-started' then image_dispatch_started_at is not null and planning_terminal_code is null
  when provider_phase='planning-terminal' then image_dispatch_started_at is null and planning_terminal_code is not null and status='failed'
  else false end);

create function public.mark_consultation_generation_phase(p_user uuid,p_job uuid,p_op uuid,p_phase text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;j public.consultation_generation_jobs;
begin
 if p_phase is null or p_phase not in ('planning','image-started') then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into operation from public.ai_operations where id=p_op and user_id=p_user and kind='generation' and state='running' for update;
 if not found then return false;end if;
 select * into j from public.consultation_generation_jobs where id=p_job and user_id=p_user and profile_id=operation.profile_id and operation_id=p_op and mode='dynamic' and status='running' for update;
 if not found or operation.idempotency_key<>j.id or not exists(select 1 from public.profiles where id=j.profile_id and user_id=p_user and deletion_state='active') then return false;end if;
 if p_phase='planning' and j.provider_phase is null then
  update public.consultation_generation_jobs set provider_phase='planning',updated_at=now() where id=j.id;return true;
 elsif p_phase='image-started' and j.provider_phase='planning' then
  update public.consultation_generation_jobs set provider_phase='image-started',image_dispatch_started_at=now(),updated_at=now() where id=j.id;return true;
 end if;
 return false;
end $$;

create function public.finish_consultation_generation_planning(p_user uuid,p_job uuid,p_op uuid,p_code text,p_requirements jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;j public.consultation_generation_jobs;call public.style_provider_usage;quote jsonb;
begin
 if p_code is null or p_code not in ('needs_evidence','invalid_plan') or jsonb_typeof(p_requirements) is distinct from 'array' then return false;end if;
 if jsonb_array_length(p_requirements) not between 1 and 2 or octet_length(p_requirements::text)>4096
  or exists(select 1 from jsonb_array_elements(p_requirements) value where jsonb_typeof(value)<>'string' or length(value#>>'{}') not between 1 and 1000) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into operation from public.ai_operations where id=p_op and user_id=p_user and kind='generation' and state='running' for update;
 if not found then return false;end if;
 select * into j from public.consultation_generation_jobs where id=p_job and user_id=p_user and profile_id=operation.profile_id and operation_id=p_op and mode='dynamic' and status='running' for update;
 if not found or operation.idempotency_key<>j.id or j.provider_phase is distinct from 'planning' or j.image_dispatch_started_at is not null then return false;end if;
 if (select count(*) from public.style_provider_usage where operation_id=p_op)<>1 then return false;end if;
 select * into call from public.style_provider_usage where operation_id=p_op and user_id=p_user and action='plan';
 if not found or call.provider_request_id is null then return false;end if;
 quote:=public.style_usage_quote(call.model,call.model_source,call.reported_usage,call.billing_context);
 if not coalesce((quote->>'canPrice')::boolean,false) then return false;end if;
 update public.consultation_generation_jobs set status='failed',provider_phase='planning-terminal',planning_terminal_code=p_code,requirements=p_requirements,updated_at=now() where id=j.id;
 return true;
end $$;

create or replace function public.quote_style_operation_usage(p_user uuid,p_op uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;call public.style_provider_usage;live public.consultation_live_sessions;
 actions text[];expected text[];n integer;amount bigint:=0;quote jsonb;quotes jsonb:='[]';basis text:='usage-estimate';entry jsonb;
begin
 select * into operation from public.ai_operations where id=p_op and user_id=p_user;
 if not found then return jsonb_build_object('canSettle',false,'gap','Operation unavailable');end if;
 select array_agg(action order by action),count(*) into actions,n from public.style_provider_usage where operation_id=p_op and user_id=p_user;
 case operation.kind
  when 'dialogue' then expected:=array['dialogue'];
  when 'editorial' then expected:=array['editorial'];
  when 'composite' then expected:=array['composite'];
  when 'generation' then
   if actions=array['plan'] and exists(
    select 1 from public.consultation_generation_jobs j
    where j.operation_id=operation.id and j.id=operation.idempotency_key and j.user_id=p_user
     and j.profile_id=operation.profile_id and j.mode='dynamic' and j.status='failed'
     and j.provider_phase='planning-terminal' and j.planning_terminal_code in ('needs_evidence','invalid_plan')
     and j.image_dispatch_started_at is null
   ) then expected:=array['plan'];
   elsif actions=array['composite','image','plan'] then expected:=array['composite','image','plan'];else expected:=array['image','inspection','plan'];end if;
  when 'live' then
   if n<>0 then return jsonb_build_object('canSettle',false,'gap','Unexpected Live call rows');end if;
   select * into live from public.consultation_live_sessions where operation_id=p_op and user_id=p_user;
   if not found or live.status<>'closed' or live.final_seconds is null or live.final_seconds<0 or live.final_seconds>86400
    or jsonb_typeof(live.backend_usage) is distinct from 'array' or jsonb_array_length(live.backend_usage)>3
    or operation.pricing_version<>'live-60s-3delegations-engineering-reserve-2026-11-01'
   then return jsonb_build_object('canSettle',false,'gap','Live outcome/duration/backend coverage unconfirmed');end if;
   amount:=ceil(live.final_seconds::numeric*50000/60)::bigint;
   quotes:=jsonb_build_array(jsonb_build_object('action','live','model','gpt-live-1','modelSource','requested','finalSeconds',live.final_seconds,'estimatedMicrousd',amount,'basis','usage-estimate'));
   for entry in select value from jsonb_array_elements(live.backend_usage) loop
    if entry->>'requestId' is null or entry->>'delegationId' is null then return jsonb_build_object('canSettle',false,'gap','Live backend identity/usage incomplete');end if;
    quote:=public.style_usage_quote(entry->>'model',entry->>'modelSource',entry->'reportedUsage',jsonb_build_object('serviceTier',coalesce(entry->>'serviceTier','unknown'),'region','global'));
    if not coalesce((quote->>'canPrice')::boolean,false) then return jsonb_build_object('canSettle',false,'gap','Live backend usage incomplete','detail',quote);end if;
    amount:=amount+(quote->>'estimatedMicrousd')::bigint;if quote->>'basis'='usage-upper-estimate' then basis:='usage-upper-estimate';end if;
    quotes:=quotes||jsonb_build_array(quote||jsonb_build_object('action','live-backend','delegationId',entry->>'delegationId'));
   end loop;
  else return jsonb_build_object('canSettle',false,'gap','Operation kind lacks complete verified billing contract');
 end case;
 if operation.kind<>'live' then
  if actions is distinct from expected then return jsonb_build_object('canSettle',false,'gap','Provider subcall coverage incomplete','actions',actions,'expected',expected);end if;
  for call in select * from public.style_provider_usage where operation_id=p_op and user_id=p_user order by action loop
   if call.provider_request_id is null then return jsonb_build_object('canSettle',false,'gap','Provider request identity missing');end if;
   quote:=public.style_usage_quote(call.model,call.model_source,call.reported_usage,call.billing_context);
   if not coalesce((quote->>'canPrice')::boolean,false) then return jsonb_build_object('canSettle',false,'gap','Provider usage is not bounded','detail',quote);end if;
   amount:=amount+(quote->>'estimatedMicrousd')::bigint;if quote->>'basis'='usage-upper-estimate' then basis:='usage-upper-estimate';end if;
   quotes:=quotes||jsonb_build_array(quote||jsonb_build_object('action',call.action,'usageId',call.id));
  end loop;
 end if;
 return jsonb_build_object('canSettle',true,'estimatedMicrousd',amount,'basis',basis,'billableCallCoverage','complete',
 'reportedPartitionCoverage',case when basis='usage-estimate' then 'complete' else 'partial' end,
 'label',case when basis='usage-estimate' then 'USAGE-PRICED ESTIMATE' else 'USAGE-PRICED CONSERVATIVE UPPER ESTIMATE' end,
 'calls',quotes,'rateVersion','openai-2026-11-01-v1','rateSource','https://developers.openai.com/api/docs/pricing');
end $$;

revoke all on function public.mark_consultation_generation_phase(uuid,uuid,uuid,text),public.finish_consultation_generation_planning(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_consultation_generation_phase(uuid,uuid,uuid,text),public.finish_consultation_generation_planning(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
