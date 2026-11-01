-- Retain earlier native-prepared lineage after an explicit photo reset.
-- No registration, lineage rebinding, status change, or automatic approval occurs here.
-- API-produced references still require ready current colour_portrait sources.
create or replace function public.review_colour_reference(p_user uuid,p_id uuid,p_revision integer,p_decision text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.colour_references; source_count integer; owner_profile uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from public.access_grants where user_id=p_user and active)
 or not exists(select 1 from public.profiles where user_id=p_user and deletion_state='active') then
  return jsonb_build_object('error','forbidden');
 end if;
 select id into owner_profile from public.profiles where user_id=p_user and deletion_state='active';
 select * into r from public.colour_references where user_id=p_user and is_current for update;
 if not found or r.id<>p_id or r.revision<>p_revision or r.status<>'pending' then
  return jsonb_build_object('error','conflict');
 end if;
 if p_decision not in ('approved','rejected') then return jsonb_build_object('error','invalid'); end if;
 perform id from public.media where id=r.media_id and user_id=p_user and profile_id=owner_profile and status='ready' and kind='colour_reference' for share;
 if not found then return jsonb_build_object('error','media_unavailable'); end if;
 perform id from public.media where id=any(r.source_media_ids) and user_id=p_user and profile_id=owner_profile and status='ready'
  and (kind='colour_portrait' or (r.provenance='native-prepared' and kind='archived_source')) for share;
 get diagnostics source_count = row_count;
 if source_count<>cardinality(r.source_media_ids) then return jsonb_build_object('error','sources_unavailable'); end if;
 update public.colour_references set status=p_decision,revision=revision+1,reviewed_at=now(),approval_version=1
 where id=r.id returning * into r;
 return jsonb_build_object('reference',to_jsonb(r));
end $$;

create or replace function public.colour_framing_source_valid(p_user uuid,p_media uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.media m on m.profile_id=p.id and m.user_id=p.user_id
 where p.user_id=p_user and p.deletion_state='active' and m.id=p_media and m.status='ready'
 and exists(select 1 from public.access_grants where user_id=p_user and active)
 and ((m.kind='colour_portrait' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.document->'photos')='array' then p.document->'photos' else '[]'::jsonb end) photo where photo->>'id'=m.id::text))
 or (m.kind='colour_reference' and exists(select 1 from public.colour_references r where r.user_id=p_user and r.media_id=m.id and r.is_current and r.status='approved' and r.approval_version=1
 and (select count(*) from public.media source where source.id=any(r.source_media_ids) and source.user_id=p_user and source.profile_id=p.id and (source.kind='colour_portrait' or (r.provenance='native-prepared' and source.kind='archived_source')) and source.status='ready')=cardinality(r.source_media_ids)))))
$$;

revoke all on function public.review_colour_reference(uuid,uuid,integer,text),public.colour_framing_source_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_colour_reference(uuid,uuid,integer,text),public.colour_framing_source_valid(uuid,uuid) to service_role;
