-- Authoritative framing provenance cannot be forged through browser-writable profile answers.
-- Reuse the operator's existing composite bound; do not install/enable a price or alter USD50 caps.
create table public.colour_framings(
 user_id uuid not null references auth.users(id),
 source_media_id uuid not null references public.media(id) on delete cascade,
 source_version text not null check(source_version ~ '^[a-f0-9]{64}$'),
 revision integer not null default 1 check(revision>0),
 crop jsonb,
 provenance text not null check(provenance in ('gpt','manual')),
 uncertainty text not null check(uncertainty in ('low','medium','high')),
 reason text not null check(length(reason) between 1 and 1000),
 model text check(model is null or length(model) between 1 and 120),
 model_source text check(model_source in ('reported','requested')),
 operation_id uuid references public.ai_operations(id),
 updated_at timestamptz not null default now(),
 primary key(user_id,source_media_id,source_version),
 check(crop is not null or uncertainty='high'),
 check((provenance='manual' and model is null and model_source is null and operation_id is null and crop is not null)
 or (provenance='gpt' and model is not null and model_source is not null and operation_id is not null))
);
alter table public.colour_framings enable row level security;
revoke all on public.colour_framings from public,anon,authenticated;
grant all on public.colour_framings to service_role;
create function public.colour_framing_source_valid(p_user uuid,p_media uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.media m on m.profile_id=p.id and m.user_id=p.user_id
 where p.user_id=p_user and p.deletion_state='active' and m.id=p_media and m.status='ready'
 and exists(select 1 from public.access_grants where user_id=p_user and active)
 and ((m.kind='colour_portrait' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.document->'photos')='array' then p.document->'photos' else '[]'::jsonb end) photo where photo->>'id'=m.id::text))
 or (m.kind='colour_reference' and exists(select 1 from public.colour_references r where r.user_id=p_user and r.media_id=m.id and r.is_current and r.status='approved' and r.approval_version=1
 and (select count(*) from public.media source where source.id=any(r.source_media_ids) and source.user_id=p_user and source.profile_id=p.id and source.kind='colour_portrait' and source.status='ready')=cardinality(r.source_media_ids)))))
$$;
create function public.colour_framing_json(f public.colour_framings) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('sourceMediaId',f.source_media_id,'sourceVersion',f.source_version,'framingRevision',f.revision,'crop',f.crop,'provenance',f.provenance,'uncertainty',f.uncertainty,'reason',f.reason,'model',f.model,'modelSource',f.model_source,'updatedAt',f.updated_at)
$$;
create function public.read_colour_framing(p_user uuid,p_media uuid,p_version text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select public.colour_framing_json(f) from public.colour_framings f where f.user_id=p_user and f.source_media_id=p_media and f.source_version=p_version and public.colour_framing_source_valid(p_user,p_media)
$$;
create function public.reserve_colour_framing(p_user uuid,p_key uuid,p_hash text,p_media uuid,p_version text,p_profile_revision integer,p_framing_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; g public.access_grants; b public.budget_control; pool public.budget_pools; price public.style_price_bounds; op public.ai_operations; f public.colour_framings; marker text;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into g from public.access_grants where user_id=p_user for update;
 if p.id is null or p.deletion_state<>'active' or g.user_id is null or not g.active then return jsonb_build_object('error','forbidden'); end if;
 marker:='framing:'||p_media::text||':'||p_version||':'||p_framing_revision::text;
 select * into op from public.ai_operations where user_id=p_user and idempotency_key=p_key;
 if found then
  if op.kind<>'composite' or op.payload_hash is distinct from p_hash or op.base_revision is distinct from p_profile_revision or op.result_ref is distinct from marker then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('created',false,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state,'purpose','colour-framing'));
 end if;
 select * into f from public.colour_framings where user_id=p_user and source_media_id=p_media and source_version=p_version for update;
 if p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is null or p_version !~ '^[a-f0-9]{64}$' or p_profile_revision is distinct from p.revision or p_framing_revision is distinct from coalesce(f.revision,0) or not public.colour_framing_source_valid(p_user,p_media) then return jsonb_build_object('error','conflict'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running','uncertain')) then return jsonb_build_object('error','in_flight'); end if;
 select * into b from public.budget_control where id=true for update;
 select * into pool from public.budget_pools where cohort=g.cohort for update;
 select * into price from public.style_price_bounds where kind='composite' and enabled;
 if b.id is null or b.emergency_disabled or price.kind is null or pool.cohort is null or b.total_limit_microusd>50000000 or b.total_limit_microusd<0 or b.reserved_microusd<0 or b.spent_microusd<0 or pool.limit_microusd<0 or pool.reserved_microusd<0 or pool.spent_microusd<0 or g.allowance_microusd<0 or g.reserved_microusd<0 or g.spent_microusd<0 or g.editorial_hold_microusd<0 or (select limit_microusd from public.budget_pools where cohort='development')>5000000 or (select sum(limit_microusd) from public.budget_pools)>b.total_limit_microusd then return jsonb_build_object('error','unavailable'); end if;
 if price.bound_microusd>b.total_limit_microusd-b.spent_microusd-b.reserved_microusd or price.bound_microusd>pool.limit_microusd-pool.spent_microusd-pool.reserved_microusd or price.bound_microusd>g.allowance_microusd-g.spent_microusd-g.reserved_microusd-g.editorial_hold_microusd then return jsonb_build_object('error','budget'); end if;
 update public.budget_control set reserved_microusd=reserved_microusd+price.bound_microusd where id=true;
 update public.budget_pools set reserved_microusd=reserved_microusd+price.bound_microusd where cohort=g.cohort;
 update public.access_grants set reserved_microusd=reserved_microusd+price.bound_microusd where user_id=p_user;
 insert into public.ai_operations(user_id,profile_id,kind,idempotency_key,payload_hash,base_revision,state,reserved_microusd,pricing_version,result_ref)
 values(p_user,p.id,'composite',p_key,p_hash,p_profile_revision,'reserved',price.bound_microusd,price.pricing_version,marker) returning * into op;
 return jsonb_build_object('created',true,'operation',jsonb_build_object('id',op.id,'kind',op.kind,'state',op.state,'purpose','colour-framing'));
end $$;
create function public.dispatch_colour_framing(p_user uuid,p_op uuid,p_media uuid,p_profile_revision integer,p_framing_revision integer,p_version text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; op public.ai_operations; f public.colour_framings;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 select * into op from public.ai_operations where id=p_op and user_id=p_user for update;
 select * into f from public.colour_framings where user_id=p_user and source_media_id=p_media and source_version=p_version for update;
 if p.id is null or p.deletion_state<>'active' or p.revision is distinct from p_profile_revision or op.profile_id is distinct from p.id or op.kind is distinct from 'composite' or op.base_revision is distinct from p_profile_revision or op.result_ref is distinct from 'framing:'||p_media::text||':'||p_version||':'||p_framing_revision::text or coalesce(f.revision,0) is distinct from p_framing_revision or not public.colour_framing_source_valid(p_user,p_media) then return false; end if;
 return public.dispatch_style_operation(p_user,p_op,120);
end $$;
create function public.save_colour_framing(p_user uuid,p_media uuid,p_version text,p_profile_revision integer,p_framing_revision integer,p_crop jsonb,p_provenance text,p_uncertainty text,p_reason text,p_model text,p_model_source text,p_op uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; f public.colour_framings; op public.ai_operations; x numeric; y numeric; w numeric; h numeric;
begin
 select * into p from public.profiles where user_id=p_user for update;
 select * into f from public.colour_framings where user_id=p_user and source_media_id=p_media and source_version=p_version for update;
 if p.id is null or p.deletion_state<>'active' or p.revision is distinct from p_profile_revision or coalesce(f.revision,0) is distinct from p_framing_revision or not public.colour_framing_source_valid(p_user,p_media) then return jsonb_build_object('error','conflict'); end if;
 if p_version is null or p_version !~ '^[a-f0-9]{64}$' or p_provenance is null or p_provenance not in ('gpt','manual') or p_uncertainty is null or p_uncertainty not in ('low','medium','high') or p_reason is null or length(p_reason) not between 1 and 1000 then return jsonb_build_object('error','invalid'); end if;
 if p_crop is not null then
  if jsonb_typeof(p_crop)<>'object' then return jsonb_build_object('error','invalid'); end if;
  if not p_crop ?& array['x','y','width','height'] or (select count(*) from jsonb_object_keys(p_crop))<>4 or jsonb_typeof(p_crop->'x')<>'number' or jsonb_typeof(p_crop->'y')<>'number' or jsonb_typeof(p_crop->'width')<>'number' or jsonb_typeof(p_crop->'height')<>'number' then return jsonb_build_object('error','invalid'); end if;
  x:=(p_crop->>'x')::numeric;y:=(p_crop->>'y')::numeric;w:=(p_crop->>'width')::numeric;h:=(p_crop->>'height')::numeric;
  if x<0 or y<0 or w<=0 or h<=0 or x+w>1 or y+h>1 then return jsonb_build_object('error','invalid'); end if;
 elsif p_uncertainty<>'high' then return jsonb_build_object('error','invalid'); end if;
 if p_provenance='gpt' then
  select * into op from public.ai_operations where id=p_op and user_id=p_user and profile_id=p.id for update;
  if op.id is null or op.kind<>'composite' or op.state<>'running' or op.base_revision is distinct from p_profile_revision or op.result_ref is distinct from 'framing:'||p_media::text||':'||p_version||':'||p_framing_revision::text or p_model is null or length(p_model) not between 1 and 120 or p_model_source is null or p_model_source not in ('reported','requested') or not exists(select 1 from public.style_provider_usage where operation_id=p_op and user_id=p_user and action='composite') then return jsonb_build_object('error','invalid'); end if;
 elsif p_op is not null or p_model is not null or p_model_source is not null or p_crop is null then return jsonb_build_object('error','invalid'); end if;
 insert into public.colour_framings(user_id,source_media_id,source_version,revision,crop,provenance,uncertainty,reason,model,model_source,operation_id)
 values(p_user,p_media,p_version,1,p_crop,p_provenance,p_uncertainty,p_reason,p_model,p_model_source,p_op)
 on conflict(user_id,source_media_id,source_version) do update set revision=colour_framings.revision+1,crop=excluded.crop,provenance=excluded.provenance,uncertainty=excluded.uncertainty,reason=excluded.reason,model=excluded.model,model_source=excluded.model_source,operation_id=excluded.operation_id,updated_at=now() returning * into f;
 return jsonb_build_object('framing',public.colour_framing_json(f));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','invalid');
end $$;
revoke all on function public.colour_framing_source_valid(uuid,uuid),public.colour_framing_json(public.colour_framings),public.read_colour_framing(uuid,uuid,text),public.reserve_colour_framing(uuid,uuid,text,uuid,text,integer,integer),public.dispatch_colour_framing(uuid,uuid,uuid,integer,integer,text),public.save_colour_framing(uuid,uuid,text,integer,integer,jsonb,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.colour_framing_source_valid(uuid,uuid),public.colour_framing_json(public.colour_framings),public.read_colour_framing(uuid,uuid,text),public.reserve_colour_framing(uuid,uuid,text,uuid,text,integer,integer),public.dispatch_colour_framing(uuid,uuid,uuid,integer,integer,text),public.save_colour_framing(uuid,uuid,text,integer,integer,jsonb,text,text,text,text,text,uuid) to service_role;
