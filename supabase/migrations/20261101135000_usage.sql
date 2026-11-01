-- Observational telemetry only. No budget policy or settlement changes.
create unique index ai_operations_usage_owner on public.ai_operations(id,user_id);
create table public.style_provider_usage (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 operation_id uuid not null,
 action text not null check(action in ('plan','image','editorial','dialogue','composite')),
 model text not null check(length(model) between 1 and 120),
 model_source text not null check(model_source in ('reported','requested')),
 provider_request_id text check(length(provider_request_id)<=200),
 reported_usage jsonb check(reported_usage is null or (jsonb_typeof(reported_usage)='object' and octet_length(reported_usage::text)<=4096)),
 pricing_version text,
 estimated_microusd bigint check(estimated_microusd>=0),
 rate_version text,
 rate_source text,
 -- Only explicit provider/invoice reconciliation may populate these fields.
 -- The transport and recordProviderUsage never infer actual dollars from tokens.
 actual_microusd bigint check(actual_microusd>=0),
 reconciliation_ref text,
 created_at timestamptz not null default now(),
 foreign key(operation_id,user_id) references public.ai_operations(id,user_id) on delete cascade,
 unique(operation_id,action),
 check((estimated_microusd is null and rate_version is null and rate_source is null) or (estimated_microusd is not null and rate_version is not null and rate_source is not null)),
 check((actual_microusd is null and reconciliation_ref is null) or (actual_microusd is not null and reconciliation_ref is not null and length(reconciliation_ref)>0))
);
create index style_provider_usage_user on public.style_provider_usage(user_id,created_at desc);
alter table public.style_provider_usage enable row level security;
revoke all on public.style_provider_usage from public,anon,authenticated;
grant all on public.style_provider_usage to service_role;

-- Service-only API: caller supplies the authenticated account, never a browser ID.
-- All aggregates cover the full account; the detail list shows the latest 100 operations.
create function public.read_style_usage(p_user uuid) returns jsonb
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
   'reconciledCallCount',(select count(*) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user and u.actual_microusd is not null),
   'actualMicrousd',(select sum(u.actual_microusd) from public.style_provider_usage u join public.ai_operations o on o.id=u.operation_id and o.user_id=u.user_id where u.user_id=p_user)
  ),
  'operations',coalesce((select jsonb_agg(row order by created_at desc) from (
   select o.id,o.kind,o.state,o.created_at,o.reserved_microusd,o.settled_microusd,o.pricing_version,
    coalesce((select jsonb_agg(jsonb_build_object('action',u.action,'model',u.model,'modelSource',u.model_source,
     'reportedUsage',u.reported_usage,'estimatedMicrousd',u.estimated_microusd,'rateVersion',u.rate_version,'rateSource',u.rate_source,
     'actualMicrousd',u.actual_microusd,'reconciliationRef',u.reconciliation_ref,'createdAt',u.created_at) order by u.created_at)
     from public.style_provider_usage u where u.operation_id=o.id and u.user_id=p_user),'[]'::jsonb) as calls
   from public.ai_operations o where o.user_id=p_user order by o.created_at desc limit 100
  ) row),'[]'::jsonb)
 )
$$;
revoke all on function public.read_style_usage(uuid) from public,anon,authenticated;
grant execute on function public.read_style_usage(uuid) to service_role;
