-- Budget-only protection requested during recording. Operator registers the
-- verified account privately; no identity or allowance change is embedded here.
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
create table if not exists public.protected_style_accounts (
 user_id uuid primary key references public.access_grants(user_id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.protected_style_accounts enable row level security;
revoke all on public.protected_style_accounts from public,anon,authenticated;
grant all on public.protected_style_accounts to service_role;
create or replace function public.style_funds_preserve_protected_accounts(p_user uuid,p_cohort text,p_bound bigint) returns boolean
language sql security invoker set search_path=public,pg_temp as $$
 select p_bound is not null and p_bound>0 and exists (
  select 1 from public.budget_control b join public.budget_pools pool on pool.cohort=p_cohort
  where b.id and not b.emergency_disabled
   and b.total_limit_microusd-b.spent_microusd-b.reserved_microusd>=p_bound+(
    select coalesce(sum(greatest(g.allowance_microusd-g.spent_microusd-g.reserved_microusd,0)),0)
    from public.protected_style_accounts a join public.access_grants g on g.user_id=a.user_id where a.user_id<>p_user)
   and pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd>=p_bound+(
    select coalesce(sum(greatest(g.allowance_microusd-g.spent_microusd-g.reserved_microusd,0)),0)
    from public.protected_style_accounts a join public.access_grants g on g.user_id=a.user_id where a.user_id<>p_user and g.cohort=p_cohort)
 );
$$;
revoke all on function public.style_funds_preserve_protected_accounts(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.style_funds_preserve_protected_accounts(uuid,text,bigint) to service_role;
do $protect$ declare f record; definition text; count integer:=0; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
 and p.proname in ('reserve_style_operation','reserve_colour_generation','reserve_consultation_operation','reserve_live_consultation','start_consultation_generation','reserve_colour_framing') loop
  definition:=pg_get_functiondef(f.oid);
  if position('pg_advisory_xact_lock(hashtextextended(''style-ledger'',0))' in definition)=0 then raise exception 'Unserialized budget adapter';end if;
  if position('style_funds_preserve_protected_accounts' in definition)=0 then
   if position('if b.id is null' in definition)=0 then raise exception 'Budget guard insertion unavailable';end if;
   definition:=replace(definition,'if b.id is null','if not public.style_funds_preserve_protected_accounts(p_user,g.cohort,price.bound_microusd) then return jsonb_build_object(''error'',''budget''); end if;'||chr(10)||'if b.id is null');
   execute definition;
  end if;
  count:=count+1;
 end loop;
 if count<>6 then raise exception 'Expected six budget adapters';end if;
end $protect$;
commit;
