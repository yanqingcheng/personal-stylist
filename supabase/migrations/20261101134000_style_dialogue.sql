-- Private append-only consultation. No model calls, approval or budget mutation.
create table public.style_dialogues (
 user_id uuid primary key references auth.users(id),
 profile_id uuid not null unique references public.profiles(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 required_question_id uuid,
 updated_at timestamptz not null default now()
);
create table public.style_dialogue_messages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.style_dialogues(user_id) on delete cascade,
 round_id uuid not null references public.rounds(id) on delete cascade,
 revision integer not null check(revision>0),
 position integer not null check(position in (0,1)),
 role text not null check(role in ('user','stylist')),
 kind text not null check(kind in ('message','question','answer')),
 text text not null check(length(text)>0 and length(text)<=24000),
 answer_to uuid references public.style_dialogue_messages(id),
 created_at timestamptz not null default now(),
 unique(user_id,revision,position)
);
alter table public.style_dialogues enable row level security;
alter table public.style_dialogue_messages enable row level security;
revoke all on public.style_dialogues,public.style_dialogue_messages from public,anon,authenticated;
grant all on public.style_dialogues,public.style_dialogue_messages to service_role;

create function public.read_style_dialogue(p_user uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('available',true,'mode','saved-plan-assistant','revision',coalesce(d.revision,0),
 'requiredQuestionId',d.required_question_id,'messages',coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'role',m.role,'text',m.text,'kind',m.kind,'roundId',m.round_id,'answerTo',m.answer_to,'createdAt',m.created_at)
 order by m.revision,m.position) from public.style_dialogue_messages m where m.user_id=p_user),'[]'::jsonb))
 from public.profiles p left join public.style_dialogues d on d.user_id=p.user_id and d.profile_id=p.id
 where p.user_id=p_user and p.deletion_state='active' and exists(select 1 from public.access_grants where user_id=p_user and active)
$$;

create function public.append_style_dialogue(p_user uuid,p_round uuid,p_revision integer,p_intake_revision integer,p_message uuid,p_text text,p_answer_to uuid,p_reply text,p_reply_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; i public.style_intakes; r public.rounds; details public.style_round_details;
 d public.style_dialogues; previous public.style_dialogue_messages; reply_id uuid:=gen_random_uuid();
begin
 -- Same profile-first lock order as intake/feedback persistence. Never touch the ledger.
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into i from public.style_intakes where user_id=p_user for update;
 insert into public.style_dialogues(user_id,profile_id) values(p_user,p.id) on conflict(user_id) do nothing;
 select * into d from public.style_dialogues where user_id=p_user and profile_id=p.id for update;
 -- Retry after a lost response is a read, even if later messages already exist.
 select * into previous from public.style_dialogue_messages where id=p_message;
 if found then
   if previous.user_id=p_user and previous.role='user' and previous.round_id=p_round and previous.text=p_text and previous.answer_to is not distinct from p_answer_to then
     return jsonb_build_object('dialogue',public.read_style_dialogue(p_user),'replayed',true);
   end if;
   return jsonb_build_object('error','conflict');
 end if;
 if d.revision<>p_revision or i.revision is distinct from p_intake_revision then return jsonb_build_object('error','conflict'); end if;
 if p_text is null or length(btrim(p_text))=0 or length(p_text)>8000 or p_reply is null or length(p_reply)=0 or length(p_reply)>24000 or p_reply_kind not in ('message','question') then return jsonb_build_object('error','invalid'); end if;
 select * into r from public.rounds where id=p_round and user_id=p_user and profile_id=p.id for update;
 if not found or r.status<>'succeeded' or coalesce(array_length(r.media_ids,1),0)=0 then return jsonb_build_object('error','unavailable'); end if;
 -- Only the current round can be revised. Old messages remain readable.
 if exists(select 1 from public.rounds where user_id=p_user and profile_id=p.id and (created_at>r.created_at or parent_round_id=r.id)) then return jsonb_build_object('error','stale'); end if;
 select * into details from public.style_round_details where round_id=r.id and user_id=p_user for update;
 if not found or i.user_id is null or details.input_hash<>public.style_input_hash(p.document,i.data) then return jsonb_build_object('error','stale'); end if;
 if exists(select 1 from public.ai_operations where user_id=p_user and state in ('reserved','running')) then return jsonb_build_object('error','in_flight'); end if;
 if d.required_question_id is distinct from p_answer_to then return jsonb_build_object('error','question'); end if;
 insert into public.style_dialogue_messages(id,user_id,round_id,revision,position,role,kind,text,answer_to)
 values(p_message,p_user,p_round,d.revision+1,0,'user',case when p_answer_to is null then 'message' else 'answer' end,p_text,p_answer_to),
 (reply_id,p_user,p_round,d.revision+1,1,'stylist',p_reply_kind,p_reply,null);
 update public.style_dialogues set revision=revision+1,required_question_id=case when p_reply_kind='question' then reply_id else null end,updated_at=now() where user_id=p_user;
 -- A message is never satisfaction. Approval must happen separately afterwards.
 update public.style_round_details set approved_hash=null,editorial=null,updated_at=now() where round_id=p_round and user_id=p_user;
 return jsonb_build_object('dialogue',public.read_style_dialogue(p_user));
end $$;
revoke all on function public.read_style_dialogue(uuid),public.append_style_dialogue(uuid,uuid,integer,integer,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_style_dialogue(uuid),public.append_style_dialogue(uuid,uuid,integer,integer,uuid,text,uuid,text,text) to service_role;

create function public.clear_dialogue_on_profile_deletion() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.deletion_state<>'active' then delete from public.style_dialogues where user_id=new.user_id; end if;
 return new;
end $$;
create trigger clear_dialogue_on_profile_deletion after update of deletion_state on public.profiles
for each row execute function public.clear_dialogue_on_profile_deletion();
revoke all on function public.clear_dialogue_on_profile_deletion() from public,anon,authenticated;

-- Web callers use these wrappers. Keep the original RPCs for existing isolated
-- ledger tests; clients still have no execute privileges on either path.
create function public.save_style_feedback_with_dialogue(p_user uuid,p_round uuid,p_feedback text,p_approve boolean,p_dialogue_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; d public.style_dialogues;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into d from public.style_dialogues where user_id=p_user and profile_id=p.id;
 if p_dialogue_revision is null or p_dialogue_revision<0 or coalesce(d.revision,0)<>p_dialogue_revision then return jsonb_build_object('error','stale'); end if;
 if d.required_question_id is not null then return jsonb_build_object('error','stale','reason','clarification'); end if;
 return public.save_style_feedback(p_user,p_round,p_feedback,p_approve);
end $$;

create function public.reserve_style_operation_with_dialogue(p_user uuid,p_key uuid,p_hash text,p_kind text,p_revision integer,p_round uuid,p_dialogue_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.profiles; d public.style_dialogues;
begin
 -- Match the ledger's global-lock-before-profile ordering. Append never takes
 -- the ledger lock, and it rejects any already reserved/running operation.
 perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.deletion_state<>'active' or not exists(select 1 from public.access_grants where user_id=p_user and active) then return jsonb_build_object('error','forbidden'); end if;
 select * into d from public.style_dialogues where user_id=p_user and profile_id=p.id;
 if p_dialogue_revision is null or p_dialogue_revision<0 or coalesce(d.revision,0)<>p_dialogue_revision then return jsonb_build_object('error','conflict'); end if;
 if d.required_question_id is not null then return jsonb_build_object('error','conflict','reason','clarification'); end if;
 -- Legacy feedback can revoke approval without incrementing dialogue revision.
 if p_kind='editorial' and not exists(
   select 1 from public.style_round_details details join public.style_intakes i on i.user_id=details.user_id
   join public.rounds r on r.id=details.round_id and r.user_id=details.user_id
   where details.round_id=p_round and details.user_id=p_user and r.profile_id=p.id and r.status='succeeded'
   and details.approved_hash is not null and details.approved_hash=public.style_input_hash(p.document,i.data)
 ) then return jsonb_build_object('error','conflict','reason','approval'); end if;
 return public.reserve_new_style_operation(p_user,p_key,p_hash,p_kind,p_revision,p_round);
end $$;
revoke all on function public.save_style_feedback_with_dialogue(uuid,uuid,text,boolean,integer),public.reserve_style_operation_with_dialogue(uuid,uuid,text,text,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_style_feedback_with_dialogue(uuid,uuid,text,boolean,integer),public.reserve_style_operation_with_dialogue(uuid,uuid,text,text,integer,uuid,integer) to service_role;
