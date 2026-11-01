-- Prices are estimates from retained usage, never provider invoices.
-- Sources fetched 2026-11-01:
-- https://developers.openai.com/api/docs/pricing
-- https://developers.openai.com/api/docs/guides/prompt-caching#monitor-cache-performance
-- https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
alter table public.style_provider_usage add column billing_context jsonb not null default '{}'::jsonb
 check(jsonb_typeof(billing_context)='object' and octet_length(billing_context::text)<=2048);
alter table public.style_provider_usage add column pricing_basis text check(pricing_basis in ('usage-estimate','usage-upper-estimate'));
alter table public.style_provider_usage add column pricing_gap text check(length(pricing_gap)<=1000);
alter table public.ai_operations add column settlement_basis text not null default 'engineering-reserve'
 check(settlement_basis in ('engineering-reserve','usage-estimate','usage-upper-estimate','not-dispatched'));
create table public.style_usage_reconciliations(
 id uuid primary key default gen_random_uuid(),operation_id uuid not null references public.ai_operations(id),
 user_id uuid not null references auth.users(id),previous_settled_microusd bigint not null,
 estimated_settled_microusd bigint not null,refunded_microusd bigint not null check(refunded_microusd>=0),
 pricing_basis text not null check(pricing_basis in ('usage-estimate','usage-upper-estimate')),
 rate_version text not null,quote jsonb not null,created_at timestamptz not null default now(),
 unique(operation_id,rate_version)
);
alter table public.style_usage_reconciliations enable row level security;
revoke all on public.style_usage_reconciliations from public,anon,authenticated;
grant all on public.style_usage_reconciliations to service_role;

create function public.style_usage_count(p_value jsonb) returns numeric
language sql immutable set search_path=public,pg_temp as $$
 select case when jsonb_typeof(p_value)='number' and p_value::text ~ '^[0-9]{1,10}$'
 then case when (p_value::text)::numeric<=1000000000 then (p_value::text)::numeric else null end else null end
$$;

create function public.style_usage_quote(p_model text,p_model_source text,p_usage jsonb,p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare i numeric; o numeric; total numeric; cached numeric; written numeric; w30 numeric; w12 numeric;
 ti numeric; ii numeric; io numeric; ot numeric; base numeric; cache_rate numeric; out_rate numeric;
 factor numeric:=1; tier numeric:=1; amount numeric; exact boolean:=false; gap text:=''; model text;
begin
 if p_model_source not in ('reported','requested') or jsonb_typeof(p_usage) is distinct from 'object' then return jsonb_build_object('canPrice',false,'gap','Missing model provenance or token usage');end if;
 i:=public.style_usage_count(p_usage->'input_tokens');o:=public.style_usage_count(p_usage->'output_tokens');total:=public.style_usage_count(p_usage->'total_tokens');
 if i is null or o is null or total is null or total<>i+o then return jsonb_build_object('canPrice',false,'gap','Missing or inconsistent total input/output usage');end if;
 if coalesce(public.style_usage_count(p_usage#>'{input_tokens_details,audio_tokens}'),0)>0 or coalesce(public.style_usage_count(p_usage#>'{output_tokens_details,audio_tokens}'),0)>0 then return jsonb_build_object('canPrice',false,'gap','Unpriced audio modality');end if;
 if coalesce(p_context->>'region','global')<>'global' then return jsonb_build_object('canPrice',false,'gap','Unverified regional pricing');end if;
 if p_model in ('gpt-6.1-sol','gpt-6.1-terra') then
  if p_model_source<>'reported' then return jsonb_build_object('canPrice',false,'gap','Text model not reported');end if;
  base:=case when p_model='gpt-6.1-sol' then 2 else 1 end;
  cache_rate:=case when p_model='gpt-6.1-sol' then 0.10 else 0.05 end;
  out_rate:=case when p_model='gpt-6.1-sol' then 10 else 5 end;
  if i>272000 then base:=base*2;cache_rate:=cache_rate*2;out_rate:=out_rate*1.5;end if;
  case coalesce(p_context->>'serviceTier','unknown')
   when 'default','standard' then tier:=1;
   when 'fast','priority' then tier:=2;
   when 'ultrafast' then if p_model<>'gpt-6.1-sol' then return jsonb_build_object('canPrice',false,'gap','No verified Ultrafast rate for this model');end if;tier:=6;
   when 'flex','batch' then tier:=0.5;
   when 'unknown' then tier:=case when p_model='gpt-6.1-sol' then 6 else 2 end;gap:='Historical/unknown service tier: maximum documented tier';
   else return jsonb_build_object('canPrice',false,'gap','Service tier has no verified rate');
  end case;
  cached:=public.style_usage_count(p_usage#>'{input_tokens_details,cached_tokens}');
  written:=public.style_usage_count(p_usage#>'{input_tokens_details,cache_write_tokens}');
  w30:=public.style_usage_count(p_usage#>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}');
  w12:=public.style_usage_count(p_usage#>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}');
  if written=0 then w30:=coalesce(w30,0);w12:=coalesce(w12,0);end if;
  if cached is not null and written is not null and w30 is not null and w12 is not null
   and cached+written<=i and w30+w12=written and gap='' then
   amount:=((i-cached-written)*base+cached*cache_rate+w30*base*1.25+w12*base*2.5+o*out_rate)*tier;exact:=true;
  else
   -- Explicitly conservative: every input token at the maximum 12-hour write
   -- price, every output token (including reasoning) at the selected tier.
   amount:=(i*base*2.5+o*out_rate)*tier;
   gap:=concat_ws('; ',nullif(gap,''),'Cache read/write partition missing or incomplete: all input at maximum 12h-write rate');
  end if;
 elsif p_model in ('gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08') then
  -- These server transports use /images/edits, not Batch/Responses image tools.
  -- Cached-input discounts apply only to Responses; never invent them here.
  ti:=public.style_usage_count(p_usage#>'{input_tokens_details,text_tokens}');ii:=public.style_usage_count(p_usage#>'{input_tokens_details,image_tokens}');
  io:=public.style_usage_count(p_usage#>'{output_tokens_details,image_tokens}');ot:=public.style_usage_count(p_usage#>'{output_tokens_details,text_tokens}');
  if ti is not null and ii is not null and io is not null and ot=0 and ti+ii=i and io=o then amount:=ti*5+ii*8+io*30;exact:=true;
  else amount:=i*8+o*30;gap:='Image modality partition incomplete: maximum image input/output rates';end if;
 else return jsonb_build_object('canPrice',false,'gap','Model has no verified rate card');end if;
 amount:=ceil(amount);
 if amount<0 or amount>9007199254740991 then return jsonb_build_object('canPrice',false,'gap','Estimate outside safe numeric range');end if;
 return jsonb_build_object('canPrice',true,'estimatedMicrousd',amount::bigint,
 'basis',case when exact then 'usage-estimate' else 'usage-upper-estimate' end,
 'label',case when exact then 'USAGE-PRICED ESTIMATE' else 'USAGE-PRICED CONSERVATIVE UPPER ESTIMATE' end,
 'reportedPartitionCoverage',case when exact then 'complete' else 'partial' end,
 'gap',nullif(gap,''),'rateVersion','openai-2026-11-01-v1','rateSource','https://developers.openai.com/api/docs/pricing');
end $$;

create function public.record_style_provider_usage(p_user uuid,p_op uuid,p_action text,p_model text,p_model_source text,p_request_id text,p_usage jsonb,p_context jsonb default '{}'::jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;quote jsonb;recorded public.style_provider_usage;
begin
 select * into operation from public.ai_operations where id=p_op and user_id=p_user;
 if not found or p_action not in ('plan','image','editorial','dialogue','composite','transcription','voice','inspection')
 or p_model is null or p_model!~'^[a-zA-Z0-9._:-]{1,120}$' or p_model_source not in('reported','requested')
 or p_usage is not null and (jsonb_typeof(p_usage)<>'object' or octet_length(p_usage::text)>4096)
 or jsonb_typeof(p_context) is distinct from 'object' or octet_length(p_context::text)>2048 then return false;end if;
 quote:=public.style_usage_quote(p_model,p_model_source,p_usage,p_context);
 insert into public.style_provider_usage(user_id,operation_id,action,model,model_source,provider_request_id,reported_usage,pricing_version,billing_context,estimated_microusd,rate_version,rate_source,pricing_basis,pricing_gap)
 values(p_user,p_op,p_action,p_model,p_model_source,p_request_id,p_usage,operation.pricing_version,p_context,
 (quote->>'estimatedMicrousd')::bigint,case when (quote->>'canPrice')::boolean then quote->>'rateVersion' end,
 case when (quote->>'canPrice')::boolean then quote->>'rateSource' end,quote->>'basis',quote->>'gap')
 on conflict(operation_id,action) do nothing;
 select * into recorded from public.style_provider_usage where operation_id=p_op and user_id=p_user and action=p_action;
 return recorded.model=p_model and recorded.model_source=p_model_source and recorded.provider_request_id is not distinct from p_request_id and recorded.reported_usage is not distinct from p_usage;
end $$;

create function public.quote_style_operation_usage(p_user uuid,p_op uuid) returns jsonb
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
   if actions=array['composite','image','plan'] then expected:=array['composite','image','plan'];else expected:=array['image','inspection','plan'];end if;
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

create function public.save_style_usage_quotes(p_user uuid,p_op uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare call public.style_provider_usage;quote jsonb;
begin
 for call in select * from public.style_provider_usage where operation_id=p_op and user_id=p_user loop
  quote:=public.style_usage_quote(call.model,call.model_source,call.reported_usage,call.billing_context);
  update public.style_provider_usage set estimated_microusd=(quote->>'estimatedMicrousd')::bigint,
   rate_version=case when (quote->>'canPrice')::boolean then quote->>'rateVersion' end,
   rate_source=case when (quote->>'canPrice')::boolean then quote->>'rateSource' end,
   pricing_basis=quote->>'basis',pricing_gap=quote->>'gap' where id=call.id and user_id=p_user;
 end loop;
end $$;

create or replace function public.settle_style_operation(p_user uuid,p_id uuid,p_outcome text,p_actual bigint default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;grant_row public.access_grants;quote jsonb;charge bigint;basis text;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into operation from public.ai_operations where id=p_id and user_id=p_user for update;if not found then return false;end if;
 if p_outcome='failed_before_dispatch' and operation.state='reserved' then charge:=0;basis:='not-dispatched';
 elsif p_outcome in ('succeeded','rejected_result') and operation.state='running' then
  quote:=public.quote_style_operation_usage(p_user,p_id);
  if not coalesce((quote->>'canSettle')::boolean,false) then
   update public.ai_operations set state='uncertain',updated_at=now() where id=p_id;return false;
  end if;
  charge:=(quote->>'estimatedMicrousd')::bigint;basis:=quote->>'basis';
  if p_actual is not null and p_actual<>charge then return false;end if;
 else return false;end if;
 select * into grant_row from public.access_grants where user_id=p_user for update;if not found then return false;end if;
 perform id from public.budget_control where id and reserved_microusd>=operation.reserved_microusd for update;if not found then return false;end if;
 perform cohort from public.budget_pools where cohort=grant_row.cohort and reserved_microusd>=operation.reserved_microusd for update;if not found or grant_row.reserved_microusd<operation.reserved_microusd then return false;end if;
 perform public.save_style_usage_quotes(p_user,p_id);
 update public.budget_control set reserved_microusd=reserved_microusd-operation.reserved_microusd,spent_microusd=spent_microusd+charge,
 emergency_disabled=emergency_disabled or charge>operation.reserved_microusd where id;
 update public.budget_pools set reserved_microusd=reserved_microusd-operation.reserved_microusd,spent_microusd=spent_microusd+charge where cohort=grant_row.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd-operation.reserved_microusd,spent_microusd=spent_microusd+charge,
 editorial_hold_microusd=case when operation.kind='editorial' then 0 else editorial_hold_microusd end where user_id=p_user;
 update public.ai_operations set state=p_outcome,settled_microusd=charge,settlement_basis=basis,updated_at=now() where id=p_id;
 return true;
end $$;

-- Explicit service-only, downward-only historical reconciliation. Dry-run is pure.
-- Pending, running, uncertain and uncertain_settled outcomes are never refunded.
create function public.reconcile_style_usage_estimate(p_user uuid,p_op uuid,p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare operation public.ai_operations;grant_row public.access_grants;usage_quote jsonb;charge bigint;refund bigint;
begin
 if p_apply then perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));end if;
 select * into operation from public.ai_operations where id=p_op and user_id=p_user for update;
 if not found or operation.state not in ('succeeded','rejected_result') then return jsonb_build_object('eligible',false,'gap','Outcome not confirmed complete');end if;
 usage_quote:=public.quote_style_operation_usage(p_user,p_op);if not coalesce((usage_quote->>'canSettle')::boolean,false) then return jsonb_build_object('eligible',false,'quote',usage_quote);end if;
 charge:=(usage_quote->>'estimatedMicrousd')::bigint;
 -- Never increase a historical charge. The previous charge remains the ceiling.
 charge:=least(charge,operation.settled_microusd);refund:=operation.settled_microusd-charge;
 if not p_apply then return jsonb_build_object('eligible',true,'apply',false,'previousMicrousd',operation.settled_microusd,'settledEstimateMicrousd',charge,'refundMicrousd',refund,'quote',usage_quote);end if;
 if exists(select 1 from public.style_usage_reconciliations where operation_id=p_op and rate_version=usage_quote->>'rateVersion') then return jsonb_build_object('eligible',true,'replayed',true,'refundMicrousd',0);end if;
 select * into grant_row from public.access_grants where user_id=p_user for update;
 if not found or grant_row.spent_microusd<refund then return jsonb_build_object('eligible',false,'gap','Account counters inconsistent');end if;
 perform id from public.budget_control where id and spent_microusd>=refund for update;if not found then return jsonb_build_object('eligible',false,'gap','Global counters inconsistent');end if;
 perform cohort from public.budget_pools where cohort=grant_row.cohort and spent_microusd>=refund for update;if not found then return jsonb_build_object('eligible',false,'gap','Pool counters inconsistent');end if;
 perform public.save_style_usage_quotes(p_user,p_op);
 insert into public.style_usage_reconciliations(operation_id,user_id,previous_settled_microusd,estimated_settled_microusd,refunded_microusd,pricing_basis,rate_version,quote)
 values(p_op,p_user,operation.settled_microusd,charge,refund,usage_quote->>'basis',usage_quote->>'rateVersion',usage_quote);
 update public.budget_control set spent_microusd=spent_microusd-refund where id;
 update public.budget_pools set spent_microusd=spent_microusd-refund where cohort=grant_row.cohort;
 update public.access_grants set spent_microusd=spent_microusd-refund where user_id=p_user;
 update public.ai_operations set settled_microusd=charge,settlement_basis=usage_quote->>'basis',updated_at=now() where id=p_op;
 return jsonb_build_object('eligible',true,'applied',true,'refundMicrousd',refund,'settledEstimateMicrousd',charge,'quote',usage_quote);
end $$;
create or replace function public.read_style_usage(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'summary',jsonb_build_object(
   'operationCount',(select count(*) from public.ai_operations where user_id=p_user),
   'heldMicrousd',coalesce((select sum(reserved_microusd) from public.ai_operations where user_id=p_user and state in ('reserved','running','uncertain')),0),
   'accountingSpentMicrousd',coalesce((select sum(settled_microusd) from public.ai_operations where user_id=p_user),0),
   'reportedCallCount',(select count(*) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user and u.reported_usage is not null),
   'recordedCallCount',(select count(*) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user),
   'pricedCallCount',(select count(*) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user and u.estimated_microusd is not null),
   'estimatedMicrousd',(select sum(u.estimated_microusd) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user),
   'upperEstimateCallCount',(select count(*) from public.style_provider_usage where user_id=p_user and pricing_basis='usage-upper-estimate'),
   'unpricedCallCount',(select count(*) from public.style_provider_usage where user_id=p_user and estimated_microusd is null),
   'reconciledCallCount',(select count(*) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user and u.actual_microusd is not null),
   'actualMicrousd',(select sum(u.actual_microusd) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user)
  ),
  'operations',coalesce((select jsonb_agg(row order by created_at desc) from (
   select o.id,o.kind,o.state,o.created_at,o.reserved_microusd,o.settled_microusd,o.pricing_version,o.settlement_basis,
    coalesce((select jsonb_agg(jsonb_build_object('action',u.action,'model',u.model,'modelSource',u.model_source,
     'reportedUsage',u.reported_usage,'pricingBasis',u.pricing_basis,'pricingGap',u.pricing_gap,'billingContext',u.billing_context,'estimatedMicrousd',u.estimated_microusd,'rateVersion',u.rate_version,'rateSource',u.rate_source,
     'actualMicrousd',u.actual_microusd,'reconciliationRef',u.reconciliation_ref,'createdAt',u.created_at) order by u.created_at)
     from public.style_provider_usage u where u.operation_id=o.id and u.user_id=p_user),'[]'::jsonb) as calls
   from public.ai_operations o where o.user_id=p_user order by o.created_at desc limit 100
  ) row),'[]'::jsonb)
 )
$$;

revoke all on function public.style_usage_count(jsonb),public.style_usage_quote(text,text,jsonb,jsonb),public.record_style_provider_usage(uuid,uuid,text,text,text,text,jsonb,jsonb),public.quote_style_operation_usage(uuid,uuid),public.save_style_usage_quotes(uuid,uuid),public.reconcile_style_usage_estimate(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.style_usage_count(jsonb),public.style_usage_quote(text,text,jsonb,jsonb),public.record_style_provider_usage(uuid,uuid,text,text,text,text,jsonb,jsonb),public.quote_style_operation_usage(uuid,uuid),public.save_style_usage_quotes(uuid,uuid),public.reconcile_style_usage_estimate(uuid,uuid,boolean) to service_role;
commit;
