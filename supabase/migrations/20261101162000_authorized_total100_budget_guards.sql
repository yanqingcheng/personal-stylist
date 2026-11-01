-- Explicit additional50USD authorisation, total100 inclusive prior expenditure.
-- Keep all spent/reserved counters and existing grants; no refunds or resets.
-- This cap-only update was applied atomically with the operator's pool/account
-- funding increase during recording. Account identifiers remain private.
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
do $budget$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
 and position('50000000' in pg_get_functiondef(p.oid))>0 loop
  execute replace(pg_get_functiondef(f.oid),'50000000','100000000');
 end loop;
 update public.budget_control set total_limit_microusd=100000000 where id;
end $budget$;
commit;
