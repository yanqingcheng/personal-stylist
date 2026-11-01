-- Saved native concierge chat before outfit rounds. This schema never calls a
-- model and never manufactures a stylist message. Native replies are operator-
-- supplied original words through a service-only RPC.
create table public.consultation_sessions(
 user_id uuid primary key references auth.users(id),
 profile_id uuid not null unique references public.profiles(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 approved_output_id text check(approved_output_id is null or length(approved_output_id) between 1 and 200),
 approved_output_hash text check(approved_output_hash is null or approved_output_hash ~ '^[0-9a-f]{64}$'),
 approved_revision integer,
 updated_at timestamptz not null default now(),
 check((approved_output_id is null and approved_output_hash is null and approved_revision is null) or (approved_output_id is not null and approved_output_hash is not null and approved_revision is not null))
);
create table public.consultation_messages(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.consultation_sessions(user_id) on delete cascade,
 role text not null check(role in ('user','stylist')),
 source text not null check(source in ('user','native-codex')),
 text text not null check(length(text) between 1 and 20000),
 reply_to uuid references public.consultation_messages(id),
 active_board_id text check(active_board_id is null or length(active_board_id) between 1 and 200),
 revision integer not null check(revision>0),
 created_at timestamptz not null default now(),
 unique(user_id,revision),
 unique(reply_to),
 check((role='user' and source='user' and reply_to is null) or (role='stylist' and source='native-codex' and reply_to is not null))
);
alter table public.consultation_sessions enable row level security;
alter table public.consultation_messages enable row level security;
revoke all on public.consultation_sessions,public.consultation_messages from public,anon,authenticated;
grant all on public.consultation_sessions,public.consultation_messages to service_role;

create function public.read_consultation(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'revision',coalesce(s.revision,0),'approvedOutputId',s.approved_output_id,'approvedOutputHash',s.approved_output_hash,
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'source',m.source,'text',m.text,'replyTo',m.reply_to,'activeBoardId',m.active_board_id,'createdAt',m.created_at) order by m.revision) from public.consultation_messages m where m.user_id=p_user),'[]'::jsonb),
  'pendingReplyTo',(select m.id from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user) order by m.revision limit 1),
  'pendingCount',(select count(*) from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)),
  'status',case when exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then 'awaiting-native-reply' else 'ready' end
 )
 from public.profiles p left join public.consultation_sessions s on s.user_id=p.user_id and s.profile_id=p.id
 where p.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
$$;

create function public.append_consultation_user(p_user uuid,p_message uuid,p_revision integer,p_text text,p_board text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; previous public.consultation_messages;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 select * into previous from public.consultation_messages where id=p_message;
 if found then
  if previous.user_id=p_user and previous.role='user' and previous.text=p_text and previous.active_board_id is not distinct from p_board then
   return jsonb_build_object('consultation',public.read_consultation(p_user),'replayed',true);
  end if;
  return jsonb_build_object('error','conflict','consultation',public.read_consultation(p_user));
 end if;
 if p_revision is distinct from s.revision then return jsonb_build_object('error','conflict','consultation',public.read_consultation(p_user)); end if;
 if p_message is null or p_text is null or length(btrim(p_text))=0 or length(p_text)>12000 or (p_board is not null and length(p_board) not between 1 and 200) then return jsonb_build_object('error','invalid'); end if;
 insert into public.consultation_messages(id,user_id,role,source,text,revision,active_board_id) values(p_message,p_user,'user','user',p_text,s.revision+1,p_board);
 update public.consultation_sessions set revision=revision+1,approved_output_id=null,approved_output_hash=null,approved_revision=null,updated_at=now() where user_id=p_user;
 return jsonb_build_object('consultation',public.read_consultation(p_user),'replayed',false);
end $$;

create function public.append_native_reply(p_user uuid,p_reply_to uuid,p_text text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions; target public.consultation_messages; previous public.consultation_messages;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if not found then return jsonb_build_object('error','unavailable'); end if;
 select * into target from public.consultation_messages where id=p_reply_to and user_id=p_user and role='user' for update;
 if not found then return jsonb_build_object('error','unavailable'); end if;
 select * into previous from public.consultation_messages where reply_to=target.id and user_id=p_user and role='stylist';
 if found then
  if previous.text=p_text then return jsonb_build_object('consultation',public.read_consultation(p_user),'replayed',true); end if;
  return jsonb_build_object('error','conflict');
 end if;
 if p_text is null or length(btrim(p_text))=0 or length(p_text)>20000 then return jsonb_build_object('error','invalid'); end if;
 insert into public.consultation_messages(user_id,role,source,text,reply_to,revision,active_board_id) values(p_user,'stylist','native-codex',p_text,target.id,s.revision+1,target.active_board_id);
 update public.consultation_sessions set revision=revision+1,approved_output_id=null,approved_output_hash=null,approved_revision=null,updated_at=now() where user_id=p_user;
 return jsonb_build_object('consultation',public.read_consultation(p_user),'replayed',false);
end $$;

create function public.read_pending_consultation(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'text',m.text,'activeBoardId',m.active_board_id,'createdAt',m.created_at) order by m.revision),'[]'::jsonb)
 from public.consultation_messages m join public.profiles p on p.user_id=m.user_id
 where m.user_id=p_user and m.role='user' and p.deletion_state='active'
 and exists(select 1 from public.access_grants where user_id=p_user and active)
 and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)
$$;
revoke all on function public.read_consultation(uuid),public.append_consultation_user(uuid,uuid,integer,text,text),public.append_native_reply(uuid,uuid,text),public.read_pending_consultation(uuid) from public,anon,authenticated;
grant execute on function public.read_consultation(uuid),public.append_consultation_user(uuid,uuid,integer,text,text),public.append_native_reply(uuid,uuid,text),public.read_pending_consultation(uuid) to service_role;

create function public.clear_consultation_on_deletion() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.deletion_state<>'active' then delete from public.consultation_sessions where user_id=new.user_id; end if;
 return new;
end $$;
create trigger clear_consultation_on_deletion after update of deletion_state on public.profiles
for each row execute function public.clear_consultation_on_deletion();
revoke all on function public.clear_consultation_on_deletion() from public,anon,authenticated;


-- The web approval route must first validate this owned prepared output/hash.
-- A chat phrase is never interpreted as approval by this persistence layer.
create function public.approve_consultation_output(p_user uuid,p_revision integer,p_output_id text,p_output_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; s public.consultation_sessions;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 insert into public.consultation_sessions(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into s from public.consultation_sessions where user_id=p_user and profile_id=p.id for update;
 if p_revision is distinct from s.revision then return jsonb_build_object('error','conflict','consultation',public.read_consultation(p_user)); end if;
 if exists(select 1 from public.consultation_messages m where m.user_id=p_user and m.role='user' and not exists(select 1 from public.consultation_messages reply where reply.reply_to=m.id and reply.user_id=p_user)) then return jsonb_build_object('error','pending','consultation',public.read_consultation(p_user)); end if;
 if p_output_id is null or length(p_output_id) not between 1 and 200 or p_output_hash is null or p_output_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid'); end if;
 update public.consultation_sessions set approved_output_id=p_output_id,approved_output_hash=p_output_hash,approved_revision=revision,updated_at=now() where user_id=p_user;
 return jsonb_build_object('consultation',public.read_consultation(p_user),'approved',true);
end $$;
revoke all on function public.approve_consultation_output(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.approve_consultation_output(uuid,integer,text,text) to service_role;
