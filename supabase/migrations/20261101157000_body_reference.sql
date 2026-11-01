-- Body originals occupy a separate four-photo allowance, never profile.photos.
create table public.style_body_references(
 user_id uuid primary key references auth.users(id),
 profile_id uuid not null references public.profiles(id),
 revision integer not null default 0,
 selected_media_id uuid references public.media(id) on delete set null,
 reference_status text not null default 'uploaded' check(reference_status in ('uploaded','pending','approved')),
 confirmed_adult boolean not null default false,
 confirmed_full_body boolean not null default false,
 approved_at timestamptz,
 updated_at timestamptz not null default now(),
 check(reference_status<>'approved' or (confirmed_adult and approved_at is not null))
);
alter table public.style_body_references enable row level security;
revoke all on public.style_body_references from public,anon,authenticated;
grant all on public.style_body_references to service_role;

-- Serialize both face and body storage admission against the same profile lock.
-- Processing/deleting objects retain their reservation in the shared 100 MiB cap.
create or replace function public.create_pending_media(p_user uuid,p_id uuid,p_path text,p_kind text,p_type text,p_size bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; m public.media;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from public.profiles where user_id=p_user and deletion_state='active' for update;
 if p.id is null or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden');end if;
 if p_id is null or p_path is distinct from p_user::text||'/pending/'||p_id::text
 or p_kind is null or p_kind not in ('colour_portrait','body_reference')
 or p_type is null or p_type not in ('image/jpeg','image/png','image/webp')
 or p_size is null or p_size<=0 or p_size>10485760 then return jsonb_build_object('error','invalid');end if;
 if (select count(*) from public.media where user_id=p_user and kind=p_kind and status in ('pending','processing','ready','deleting'))>=4
 or coalesce((select sum(byte_size) from public.media where user_id=p_user and status in ('pending','processing','ready','deleting')),0)+p_size>104857600
 then return jsonb_build_object('error','storage_limit');end if;
 insert into public.media(id,user_id,profile_id,object_path,kind,content_type,byte_size)
 values(p_id,p_user,p.id,p_path,p_kind,p_type,p_size) returning * into m;
 insert into public.upload_leases(id,user_id,object_path) values(p_id,p_user,p_path);
 return to_jsonb(m);
end $$;

create or replace function public.finish_media(p_user uuid,p_id uuid,p_path text,p_size bigint)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active)
 or p_size is null or p_size<=0 or p_size>10485760 or p_path not like p_user::text||'/ready/%'
 or coalesce((select sum(byte_size) from public.media where user_id=p_user and id<>p_id and status in ('pending','processing','ready','deleting')),0)+p_size>104857600 then return false;end if;
 update public.media set status='ready',object_path=p_path,content_type='image/jpeg',byte_size=p_size
 where id=p_id and user_id=p_user and profile_id=p.id and status='processing';
 return found;
end $$;

create function public.write_body_reference(p_user uuid,p_revision integer,p_action text,p_media uuid default null,p_adult boolean default false,p_full_body boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; r public.style_body_references; selected uuid;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden');end if;
 insert into public.style_body_references(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into r from public.style_body_references where user_id=p_user and profile_id=p.id for update;
 if p_revision is distinct from r.revision then return jsonb_build_object('error','conflict');end if;
 if p_action is null or p_action not in ('select','prepare','approve','reject') then return jsonb_build_object('error','invalid');end if;
 selected:=case when p_action='select' then p_media else r.selected_media_id end;
 perform id from public.media where id=selected and user_id=p_user and profile_id=p.id and kind='body_reference' and status='ready' for share;
 if not found then return jsonb_build_object('error','body_source_unavailable');end if;
 if p_action='prepare' and p_adult is distinct from true then return jsonb_build_object('error','coverage_required');end if;
 if p_action in ('approve','reject') and r.reference_status<>'pending' then return jsonb_build_object('error','conflict');end if;
 update public.style_body_references set selected_media_id=selected,revision=revision+1,
 reference_status=case when p_action='prepare' then 'pending' when p_action='approve' then 'approved' else 'uploaded' end,
 confirmed_adult=case when p_action='prepare' then true when p_action='approve' then r.confirmed_adult else false end,
 confirmed_full_body=case when p_action='prepare' then coalesce(p_full_body,false) when p_action='approve' then r.confirmed_full_body else false end,
 approved_at=case when p_action='approve' then now() else null end,updated_at=now()
 where user_id=p_user returning * into r;
 return jsonb_build_object('reference',to_jsonb(r));
end $$;
revoke all on function public.write_body_reference(uuid,integer,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.write_body_reference(uuid,integer,text,uuid,boolean,boolean) to service_role;
