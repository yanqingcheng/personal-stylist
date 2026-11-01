-- Apply after 159000. Configuration is deliberately disabled until the operator
-- chooses caps and funds their cohort pools after the recording freeze.
-- These are conservative ledger allowances, NOT provider-actual cost guarantees.
-- No existing grant, reservation (including unknown calls), price or switch is
-- changed. Caps are assigned once at activation, never refreshed by redemption.
create table public.invite_allowance_policies (
  cohort text primary key check (cohort in ('judge','attendee')),
  allowance_microusd bigint not null default 0 check (allowance_microusd between 0 and 50000000),
  editorial_hold_microusd bigint not null default 0 check (editorial_hold_microusd >= 0 and editorial_hold_microusd <= allowance_microusd),
  enabled boolean not null default false,
  check (not enabled or allowance_microusd > 0)
);
insert into public.invite_allowance_policies(cohort) values ('judge'),('attendee');
alter table public.invite_allowance_policies enable row level security;
revoke all on public.invite_allowance_policies from public,anon,authenticated;
grant all on public.invite_allowance_policies to service_role;

create or replace function public.redeem_invite(p_user uuid,p_digest text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  g public.access_grants; i public.invites; a public.access_attempts;
  policy public.invite_allowance_policies; b public.budget_control; pool public.budget_pools;
  cohort_commitments numeric; global_commitments numeric;
begin
  -- Serialize admission with all existing reservation/settlement adapters. A cap
  -- is a commitment of currently unspent funds, not a paid operation reservation.
  perform pg_advisory_xact_lock(hashtextextended('style-ledger',0));
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into g from public.access_grants where user_id=p_user;
  if found then return jsonb_build_object('status',case when g.active then 'activated' else 'disabled' end,'cohort',g.cohort); end if;
  insert into public.access_attempts(user_id) values(p_user) on conflict do nothing;
  select * into a from public.access_attempts where user_id=p_user for update;
  if a.window_start < now()-interval '15 minutes' then update public.access_attempts set window_start=now(),attempt_count=1 where user_id=p_user;
  elsif a.attempt_count >= 10 then return jsonb_build_object('status','rate_limited');
  else update public.access_attempts set attempt_count=attempt_count+1 where user_id=p_user; end if;
  select * into i from public.invites where digest=p_digest for update;
  if not found or not i.active or (i.expires_at is not null and i.expires_at <= now()) then return jsonb_build_object('status','invalid'); end if;
  if i.redeemed_count >= i.capacity then return jsonb_build_object('status','full'); end if;
  select * into policy from public.invite_allowance_policies where cohort=i.cohort for share;
  select * into b from public.budget_control where id=true for update;
  select * into pool from public.budget_pools where cohort=i.cohort for update;
  if policy.cohort is null or not policy.enabled or b.id is null or pool.cohort is null
     or b.total_limit_microusd not between 0 and 50000000
     or b.spent_microusd < 0 or b.reserved_microusd < 0
     or exists(select 1 from public.budget_pools where limit_microusd < 0 or spent_microusd < 0 or reserved_microusd < 0
               or spent_microusd+reserved_microusd > limit_microusd or (cohort='development' and limit_microusd > 5000000))
     or (select sum(limit_microusd) from public.budget_pools) > b.total_limit_microusd
     or exists(select 1 from public.access_grants where allowance_microusd < 0 or spent_microusd < 0 or reserved_microusd < 0 or editorial_hold_microusd < 0)
  then return jsonb_build_object('status','funding_unavailable'); end if;
  -- Count all existing grants, including disabled accounts, so reactivation is
  -- not an implicit new unfunded promise. Never refund unknown reservations.
  select coalesce(sum(greatest(allowance_microusd::numeric-spent_microusd-reserved_microusd,0)) filter(where cohort=i.cohort),0),
         coalesce(sum(greatest(allowance_microusd::numeric-spent_microusd-reserved_microusd,0)),0)
    into cohort_commitments,global_commitments from public.access_grants;
  if policy.allowance_microusd > pool.limit_microusd::numeric-pool.spent_microusd-pool.reserved_microusd-cohort_commitments
     or policy.allowance_microusd > b.total_limit_microusd::numeric-b.spent_microusd-b.reserved_microusd-global_commitments
  then return jsonb_build_object('status','funding_unavailable'); end if;
  insert into public.access_grants(user_id,invite_id,cohort,allowance_microusd,editorial_hold_microusd)
    values(p_user,i.id,i.cohort,policy.allowance_microusd,policy.editorial_hold_microusd);
  insert into public.profiles(user_id) values(p_user);
  update public.invites set redeemed_count=redeemed_count+1 where id=i.id;
  return jsonb_build_object('status','activated','cohort',i.cohort);
end $$;
revoke all on function public.redeem_invite(uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_invite(uuid,text) to service_role;

-- Operator example ONLY, not executed by this migration. Re-read the ledger
-- immediately before configuring. The 16:48 operator snapshot reported global
-- spent31.5/held3 and existing unspent grant commitments3: only12.5 is uncommitted.
-- judge45.5/attendee0/development4.5 preserves total50 and existing balances and
-- permits ONE new judge12.5. Attendee policy stays disabled, with no new funding.
-- This cannot cover the requested full journey: neutral2+crop2+three sheets9+
-- typed0.5+editorial0.5=14; Live adds2, making16. Exhaustion remains unfinished.
-- Do not call this policy a fully funded full-journey release or refund unknowns.
-- After applying, configure in one privileged transaction under the same lock:
-- begin;
-- select pg_advisory_xact_lock(hashtextextended('style-ledger',0));
-- update public.budget_pools set limit_microusd=45500000 where cohort='judge';
-- update public.budget_pools set limit_microusd=0 where cohort='attendee';
-- update public.budget_pools set limit_microusd=4500000 where cohort='development';
-- update public.invite_allowance_policies set allowance_microusd=12500000,
--   editorial_hold_microusd=500000,enabled=true where cohort='judge';
-- update public.invite_allowance_policies set enabled=false where cohort='attendee';
-- commit;
-- Account caps share the existing global/pool ledger on every actual dispatch.
-- Exhaustion pauses the saved consultation; it never implies approval.
