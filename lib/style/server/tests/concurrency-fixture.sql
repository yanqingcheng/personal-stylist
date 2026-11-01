-- Disposable database only: fixture for concurrent reservation and rounds.sql.
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.access_grants(user_id,cohort,allowance_microusd) select id,'development',1000 from auth.users where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into public.profiles(user_id,document) select id,'{"selectedTemplateId":"test"}'::jsonb from auth.users where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size,status) select user_id,user_id,id,user_id::text,'colour_portrait','image/jpeg',1,'ready' from public.profiles;
insert into public.style_intakes(user_id,profile_id,revision,data) select user_id,id,1,jsonb_build_object('photoId',user_id,'adultFullBodyConfirmed',true) from public.profiles;
insert into public.style_price_bounds values ('generation','test',600,true);
update public.budget_control set emergency_disabled=false;
update public.budget_pools set limit_microusd=1000 where cohort='development';
