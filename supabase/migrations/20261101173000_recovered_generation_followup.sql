-- A completed, explicitly linked replacement ends the old attempt's scheduling
-- barrier only. Its uncertain financial hold remains reserved in every ledger.
begin;
select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
create function public.style_recovery_allows_followup(p_user uuid,p_op uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(
  select 1 from public.consultation_generation_recoveries r
  join public.profiles p on p.id=r.profile_id and p.user_id=r.user_id and p.deletion_state='active'
  join public.consultation_generation_jobs old_job on old_job.id=r.old_job_id and old_job.user_id=r.user_id and old_job.profile_id=r.profile_id and old_job.operation_id=r.old_operation_id
  join public.ai_operations old_op on old_op.id=r.old_operation_id and old_op.user_id=r.user_id and old_op.profile_id=r.profile_id and old_op.kind='generation'
  join public.consultation_generation_jobs replacement on replacement.id=r.new_job_id and replacement.user_id=r.user_id and replacement.profile_id=r.profile_id and replacement.mode='dynamic' and replacement.payload_hash=r.payload_hash
  join public.ai_operations replacement_op on replacement_op.id=replacement.operation_id and replacement_op.user_id=r.user_id and replacement_op.profile_id=r.profile_id and replacement_op.kind='generation' and replacement_op.idempotency_key=replacement.id
  where r.user_id=p_user and r.old_operation_id=p_op and r.claimed_at is not null
   and r.request->>'idempotencyKey'=r.new_job_id::text
   and old_job.status='failed' and old_job.result is null
   and old_op.state='uncertain' and old_op.reserved_microusd>0 and old_op.settled_microusd=0
   and ((replacement.status='succeeded' and replacement.result is not null and replacement_op.state='succeeded')
    or (replacement.status='failed' and replacement_op.state in ('rejected_result','failed_before_dispatch')))
 )
$$;
revoke all on function public.style_recovery_allows_followup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.style_recovery_allows_followup(uuid,uuid) to service_role;

do $patch$
declare f record; definition text; patched text; count integer:=0;
 short_query text:='select 1 from public.ai_operations where user_id=p_user and state in (''reserved'',''running'')';
 full_query text:='select 1 from public.ai_operations where user_id=p_user and state in (''reserved'',''running'',''uncertain'')';
 guarded_short_query text:='select 1 from public.ai_operations active_barrier where active_barrier.user_id=p_user and active_barrier.state in (''reserved'',''running'') and not public.style_recovery_allows_followup(p_user,active_barrier.id)';
 guarded_query text:='select 1 from public.ai_operations active_barrier where active_barrier.user_id=p_user and active_barrier.state in (''reserved'',''running'',''uncertain'') and not public.style_recovery_allows_followup(p_user,active_barrier.id)';
 generation_guard text:='active_op.state in (''reserved'',''running'',''uncertain'') and not (';
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proname in (
  'reserve_style_operation','reserve_colour_generation','reserve_consultation_operation','reserve_live_consultation','start_consultation_generation','reserve_colour_framing',
  'start_editorial_layout','associate_prepared_consultation_action','save_style_feedback','append_style_dialogue') loop
  definition:=pg_get_functiondef(f.oid);
  if f.proname='start_consultation_generation' then
   if position(generation_guard in definition)=0 or position('consultation_generation_recoveries' in definition)=0 then raise exception 'Expected explicit recovery admission guard absent';end if;
   patched:=replace(definition,generation_guard,'active_op.state in (''reserved'',''running'',''uncertain'') and not public.style_recovery_allows_followup(p_user,active_op.id) and not (');
  else
   if ((length(definition)-length(replace(definition,short_query,'')))/length(short_query)
      +(length(definition)-length(replace(definition,full_query,'')))/length(full_query))<>1 then raise exception 'Expected one in-flight guard in %',f.proname;end if;
   patched:=replace(replace(definition,short_query,guarded_short_query),full_query,guarded_query);
  end if;
  if f.proname in ('reserve_style_operation','reserve_colour_generation','reserve_consultation_operation','reserve_live_consultation','start_consultation_generation','reserve_colour_framing') then
   if position('style_funds_preserve_protected_accounts' in patched)=0
    or patched !~ 'total_limit_microusd[[:space:]]*>[[:space:]]*100000000'
    or position('style-ledger' in patched)=0 then raise exception 'Protected budget guard missing in %',f.proname;end if;
  end if;
  execute patched;count:=count+1;
 end loop;
 if count<>10 then raise exception 'Expected ten in-flight guards';end if;
end $patch$;
commit;
