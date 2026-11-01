-- Prepared references are separate from originals and never imply calibrated colour.
create table public.colour_references (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 media_id uuid not null references public.media(id) on delete cascade,
 source_media_ids uuid[] not null check (cardinality(source_media_ids) between 1 and 4),
 provenance text not null check (provenance in ('native-prepared','api')),
 provenance_note text not null default '' check (length(provenance_note) <= 2000),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 revision integer not null default 0,
 is_current boolean not null default true,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 approval_version integer,
 check ((status='pending' and reviewed_at is null and approval_version is null)
     or (status in ('approved','rejected') and reviewed_at is not null and approval_version=1))
);
create unique index colour_references_one_current on public.colour_references(user_id) where is_current;
alter table public.colour_references enable row level security;
revoke all on public.colour_references from anon, authenticated;
grant all on public.colour_references to service_role;

-- The operator creates an owned ready media row + uploads its object first.
-- This RPC validates every source and atomically supersedes the previous reference.
create function public.register_colour_reference(p_user uuid,p_media uuid,p_sources uuid[],p_provenance text,p_note text default '')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.colour_references; source_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from public.access_grants where user_id=p_user and active)
 or not exists(select 1 from public.profiles where user_id=p_user and deletion_state='active') then
  return jsonb_build_object('error','forbidden');
 end if;
 if p_provenance not in ('native-prepared','api') or p_note is null or length(p_note)>2000
 or p_sources is null or cardinality(p_sources) not between 1 and 4
 or p_media=any(p_sources) then return jsonb_build_object('error','invalid'); end if;
 perform id from public.media where id=p_media and user_id=p_user and status='ready'
  and kind='colour_reference' and object_path like p_user::text || '/%' for share;
 if not found then return jsonb_build_object('error','media_unavailable'); end if;
 perform id from public.media where id=any(p_sources) and user_id=p_user
  and status='ready' and kind='colour_portrait' for share;
 get diagnostics source_count = row_count;
 if source_count<>cardinality(p_sources) then return jsonb_build_object('error','sources_unavailable'); end if;
 update public.colour_references set is_current=false where user_id=p_user and is_current;
 insert into public.colour_references(user_id,media_id,source_media_ids,provenance,provenance_note)
 values(p_user,p_media,p_sources,p_provenance,p_note) returning * into result;
 return jsonb_build_object('reference',to_jsonb(result));
end $$;

create function public.review_colour_reference(p_user uuid,p_id uuid,p_revision integer,p_decision text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.colour_references; source_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from public.access_grants where user_id=p_user and active)
 or not exists(select 1 from public.profiles where user_id=p_user and deletion_state='active') then
  return jsonb_build_object('error','forbidden');
 end if;
 select * into r from public.colour_references where user_id=p_user and is_current for update;
 if not found or r.id<>p_id or r.revision<>p_revision or r.status<>'pending' then
  return jsonb_build_object('error','conflict');
 end if;
 if p_decision not in ('approved','rejected') then return jsonb_build_object('error','invalid'); end if;
 perform id from public.media where id=r.media_id and user_id=p_user and status='ready' and kind='colour_reference' for share;
 if not found then return jsonb_build_object('error','media_unavailable'); end if;
 perform id from public.media where id=any(r.source_media_ids) and user_id=p_user and status='ready' and kind='colour_portrait' for share;
 get diagnostics source_count = row_count;
 if source_count<>cardinality(r.source_media_ids) then return jsonb_build_object('error','sources_unavailable'); end if;
 update public.colour_references set status=p_decision,revision=revision+1,reviewed_at=now(),approval_version=1
 where id=r.id returning * into r;
 return jsonb_build_object('reference',to_jsonb(r));
end $$;
revoke all on function public.register_colour_reference(uuid,uuid,uuid[],text,text),public.review_colour_reference(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.register_colour_reference(uuid,uuid,uuid[],text,text),public.review_colour_reference(uuid,uuid,integer,text) to service_role;
