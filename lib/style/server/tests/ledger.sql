-- Run after the foundation and stage2 migrations in a disposable database.
begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.access_grants(user_id,cohort,allowance_microusd,editorial_hold_microusd) values ('10000000-0000-0000-0000-000000000001','development',1000,200),('10000000-0000-0000-0000-000000000002','development',1000,0);
insert into public.profiles(user_id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
update public.profiles set document='{"selectedTemplateId":"test"}'::jsonb;
insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size,status) select '30000000-0000-0000-0000-000000000001',user_id,id,'test','colour_portrait','image/jpeg',1,'ready' from public.profiles where user_id='10000000-0000-0000-0000-000000000001';
insert into public.style_price_bounds values ('generation','test',600,true);
update public.budget_control set emergency_disabled=false;
update public.budget_pools set limit_microusd=1000 where cohort='development';
do $$
declare a uuid; r jsonb; u uuid := '10000000-0000-0000-0000-000000000001'; v uuid := '10000000-0000-0000-0000-000000000002'; k uuid := '20000000-0000-0000-0000-000000000001'; h text := repeat('a',64);
begin
 r:=public.save_style_intake(u,0,'{"photoId":null}'::jsonb); if (r->'intake'->>'revision')::int <> 1 then raise exception 'save failed'; end if;
 r:=public.save_style_intake(u,0,'{"photoId":null}'::jsonb); if r->>'error' <> 'conflict' then raise exception 'CAS failed'; end if;
 r:=public.save_style_intake(v,0,'{"photoId":"30000000-0000-0000-0000-000000000001"}'::jsonb); if r->>'error' <> 'photo' then raise exception 'unowned photo accepted'; end if;
 r:=public.save_style_intake(u,1,'{"photoId":"30000000-0000-0000-0000-000000000001","adultFullBodyConfirmed":true}'::jsonb);
 r:=public.reserve_style_operation(u,k,h,'generation',2,null); a:=(r->'operation'->>'id')::uuid; if a is null then raise exception 'reserve failed: %',r; end if;
 r:=public.reserve_style_operation(u,k,h,'generation',2,null); if (r->'operation'->>'id')::uuid <> a then raise exception 'retry not idempotent'; end if;
 r:=public.reserve_style_operation(u,k,repeat('b',64),'generation',2,null); if r->>'error' <> 'conflict' then raise exception 'key mismatch accepted'; end if;
 r:=public.save_style_intake(v,0,'{"photoId":null}'::jsonb);
 r:=public.reserve_style_operation(v,'20000000-0000-0000-0000-000000000002',h,'generation',2,null); if r->>'error' <> 'invalid' then raise exception 'missing reference accepted'; end if;
 if not public.settle_style_operation(u,a,'failed_before_dispatch',null) then raise exception 'pre-dispatch release failed'; end if;
 if (select reserved_microusd from public.budget_control) <> 0 or (select spent_microusd from public.budget_control) <> 0 then raise exception 'pre-dispatch counters wrong'; end if;
 r:=public.reserve_style_operation(u,'20000000-0000-0000-0000-000000000003',h,'generation',2,null); a:=(r->'operation'->>'id')::uuid;
 if a is null or not public.dispatch_style_operation(u,a,1) or public.dispatch_style_operation(u,a,1) then raise exception 'dispatch guard failed'; end if;
 if public.settle_style_operation(u,a,'failed_before_dispatch',null) or (select reserved_microusd from public.budget_control) <> 600 then raise exception 'running request was refunded'; end if;
 update public.ai_operations set lease_expires_at=now()-interval '1 second' where id=a;
 perform public.expire_style_operations(u);
 if (select state from public.ai_operations where id=a) <> 'uncertain' or (select reserved_microusd from public.budget_control) <> 600 then raise exception 'uncertain reserve lost'; end if;
 if not public.settle_style_operation(u,a,'uncertain_settled',null) or public.settle_style_operation(u,a,'uncertain_settled',null) then raise exception 'settlement guard failed'; end if;
 if (select spent_microusd from public.budget_control) <> 600 or (select reserved_microusd from public.budget_control) <> 0 then raise exception 'settlement wrong'; end if;
 update public.profiles set deletion_state='deleting' where user_id=u;
 if exists(select 1 from public.style_intakes where user_id=u) then raise exception 'intake not deleted'; end if;
end $$;
rollback;
