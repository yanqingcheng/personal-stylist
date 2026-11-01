-- Run after migrations and an isolated generation fixture has been created.
begin;
do $$
declare u uuid := '10000000-0000-0000-0000-000000000001'; o uuid; rid uuid; h text; result jsonb; media uuid := '40000000-0000-0000-0000-000000000001'; path text;
begin
 select id into o from public.ai_operations where user_id=u and state='reserved';
 if not public.dispatch_style_operation(u,o,60) then raise exception 'dispatch failed'; end if;
 select public.style_input_hash(p.document,i.data) into h from public.profiles p join public.style_intakes i on i.user_id=p.user_id where p.user_id=u;
 result:=public.save_style_plan(u,o,null,h,'{"looks":[]}'::jsonb); rid:=(result->>'roundId')::uuid;
 if rid is null then raise exception 'plan failed %',result; end if;
 path:=u::text||'/generated/'||media::text;
 if not public.lease_style_upload(u,o,media,path) then raise exception 'lease failed'; end if;
 if not exists(select 1 from public.upload_leases where id=media and user_id=u and object_path=path and expires_at>now()) then raise exception 'lease missing'; end if;
 if not public.finish_style_image(u,o,rid,media,path,100) then raise exception 'image commit failed'; end if;
 if not public.settle_style_operation(u,o,'succeeded') then raise exception 'settlement failed'; end if;
 result:=public.save_style_feedback(u,rid,'I like the colour',true);
 if result->>'approved'<>'true' or (public.read_style_rounds(u)->0->>'approved')<>'true' then raise exception 'approval failed %',result; end if;
 update public.style_intakes set data=data||'{"preferences":"changed"}'::jsonb where user_id=u;
 if (public.read_style_rounds(u)->0->>'approved')<>'false' then raise exception 'stale approval visible'; end if;
 result:=public.save_style_feedback(u,rid,'',true);
 if result->>'error'<>'stale' then raise exception 'stale approval accepted'; end if;
 update public.profiles set deletion_state='deleting' where user_id=u;
 if public.lease_style_upload(u,o,'50000000-0000-0000-0000-000000000001',u::text||'/generated/50000000-0000-0000-0000-000000000001') then raise exception 'deleted profile accepted upload lease'; end if;
 if public.finish_style_image(u,o,rid,'50000000-0000-0000-0000-000000000001',u::text||'/generated/50000000-0000-0000-0000-000000000001',100) then raise exception 'deleted profile accepted result'; end if;
end $$;
rollback;
