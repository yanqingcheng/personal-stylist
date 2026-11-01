create table public.consultation_editorial_layouts(
 id uuid primary key,user_id uuid not null references public.consultation_sessions(user_id) on delete cascade,
 editorial_action_id uuid not null references public.consultation_actions(id) on delete cascade,
 base_revision integer not null,output_id text not null,output_hash text not null check(output_hash~'^[a-f0-9]{64}$'),
 editorial_hash text not null check(editorial_hash~'^[a-f0-9]{64}$'),payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),
 operation_id uuid not null references public.ai_operations(id),
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','uncertain')),
 layout jsonb check(layout is null or (jsonb_typeof(layout)='object' and octet_length(layout::text)<=64000)),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.consultation_editorial_layouts enable row level security;
revoke all on public.consultation_editorial_layouts from public,anon,authenticated;
grant all on public.consultation_editorial_layouts to service_role;

create function public.editorial_layout_approval_current(p_user uuid,p_action uuid,p_revision integer,p_output text,p_output_hash text,p_editorial_hash text)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.consultation_sessions s on s.user_id=p.user_id and s.profile_id=p.id
 join public.consultation_actions a on a.user_id=p.user_id and a.id=p_action
 where p.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
 and s.revision=p_revision and s.approved_revision=s.revision and s.approved_output_id=p_output and s.approved_output_hash=p_output_hash
 and a.kind='editorial' and a.status='succeeded' and a.base_revision=s.revision and a.output_id=p_output and a.output_hash=p_output_hash
 and a.result is not null and length(btrim(a.result))>0 and encode(extensions.digest(convert_to(a.result,'UTF8'),'sha256'),'hex')=p_editorial_hash)
$$;

create function public.start_editorial_layout(p_user uuid,p_id uuid,p_action uuid,p_revision integer,p_output text,p_output_hash text,p_editorial_hash text,p_payload_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.consultation_editorial_layouts;reserved jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 perform id from public.profiles where user_id=p_user and deletion_state='active' for update;
 if not found then return jsonb_build_object('error','forbidden');end if;
 if not public.editorial_layout_approval_current(p_user,p_action,p_revision,p_output,p_output_hash,p_editorial_hash)then return jsonb_build_object('error','approval');end if;
 select * into r from public.consultation_editorial_layouts where id=p_id;
 if found then
  if r.user_id is distinct from p_user or r.payload_hash is distinct from p_payload_hash or r.editorial_action_id is distinct from p_action then return jsonb_build_object('error','conflict');end if;
  return jsonb_build_object('created',false,'layoutId',r.id,'operationId',r.operation_id,'status',r.status);
 end if;
 if p_id is null or p_payload_hash is null or p_payload_hash!~'^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid');end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running','uncertain'))then return jsonb_build_object('error','in_flight');end if;
 reserved:=public.reserve_new_style_operation(p_user,p_id,p_payload_hash,'editorial',p_revision,null);
 if reserved?'error' then return reserved;end if;
 if reserved->>'created' is distinct from 'true' then return jsonb_build_object('error','conflict');end if;
 insert into public.consultation_editorial_layouts(id,user_id,editorial_action_id,base_revision,output_id,output_hash,editorial_hash,payload_hash,operation_id)
 values(p_id,p_user,p_action,p_revision,p_output,p_output_hash,p_editorial_hash,p_payload_hash,(reserved->'operation'->>'id')::uuid) returning * into r;
 return jsonb_build_object('created',true,'layoutId',r.id,'operationId',r.operation_id,'status',r.status);
end $$;

create function public.dispatch_editorial_layout(p_user uuid,p_id uuid)returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.consultation_editorial_layouts;
begin
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 perform id from public.profiles where user_id=p_user for update;
 perform user_id from public.consultation_sessions where user_id=p_user for update;
 select * into r from public.consultation_editorial_layouts where id=p_id and user_id=p_user for update;
 if r.id is null or r.status<>'pending' or not public.editorial_layout_approval_current(p_user,r.editorial_action_id,r.base_revision,r.output_id,r.output_hash,r.editorial_hash)then return false;end if;
 if not public.dispatch_style_operation(p_user,r.operation_id,180)then return false;end if;
 update public.consultation_editorial_layouts set status='running',updated_at=now()where id=r.id;return true;
end $$;

create function public.finish_editorial_layout(p_user uuid,p_id uuid,p_layout jsonb)returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.consultation_editorial_layouts;
begin
 perform id from public.profiles where user_id=p_user for update;
 perform user_id from public.consultation_sessions where user_id=p_user for update;
 select * into r from public.consultation_editorial_layouts where id=p_id and user_id=p_user for update;
 if r.id is null or r.status<>'running' or not public.editorial_layout_approval_current(p_user,r.editorial_action_id,r.base_revision,r.output_id,r.output_hash,r.editorial_hash)
 or not exists(select 1 from public.ai_operations where id=r.operation_id and user_id=p_user and kind='editorial' and state='running')
 or p_layout is null or jsonb_typeof(p_layout)<>'object' or octet_length(p_layout::text)>64000 then return false;end if;
 update public.consultation_editorial_layouts set status='succeeded',layout=p_layout,updated_at=now()where id=r.id;return true;
end $$;
revoke all on function public.editorial_layout_approval_current(uuid,uuid,integer,text,text,text),public.start_editorial_layout(uuid,uuid,uuid,integer,text,text,text,text),public.dispatch_editorial_layout(uuid,uuid),public.finish_editorial_layout(uuid,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.editorial_layout_approval_current(uuid,uuid,integer,text,text,text),public.start_editorial_layout(uuid,uuid,uuid,integer,text,text,text,text),public.dispatch_editorial_layout(uuid,uuid),public.finish_editorial_layout(uuid,uuid,jsonb)to service_role;
