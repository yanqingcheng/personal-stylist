#!/usr/bin/env bash
set -euo pipefail
box=stylist-stage1-sql-check-$$
cleanup(){ docker rm -f "$box" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$box" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
for i in $(seq 1 80); do if [ "$(docker logs "$box" 2>&1 | rg -c "database system is ready to accept connections" || true)" = 2 ]; then break; fi; sleep .25; done
docker exec -i "$box" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role bypassrls;
create schema extensions; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
SQL
docker exec -i "$box" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261101000000_foundation.sql >/dev/null
docker exec -i "$box" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.invites(digest,cohort,capacity,active) values ('test-attendee','attendee',1,true),('test-judge','judge',1,true);
SQL
docker exec "$box" psql -U postgres -At -c "select redeem_invite('00000000-0000-0000-0000-000000000001','test-attendee')->>'status'" >/tmp/stylist-race-a-$$ & a=$!
docker exec "$box" psql -U postgres -At -c "select redeem_invite('00000000-0000-0000-0000-000000000002','test-attendee')->>'status'" >/tmp/stylist-race-b-$$ & b=$!
wait "$a"; wait "$b"
cat /tmp/stylist-race-a-$$ /tmp/stylist-race-b-$$ | sort | diff -u <(printf 'activated\nfull\n') -
rm /tmp/stylist-race-a-$$ /tmp/stylist-race-b-$$
docker exec -i "$box" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare r jsonb; winner uuid; begin
 select user_id into winner from access_grants where cohort='attendee';
 r:=redeem_invite(winner,'test-attendee'); if r->>'status'<>'activated' then raise exception 'duplicate activation failed'; end if;
 r:=redeem_invite('00000000-0000-0000-0000-000000000003','test-judge'); if r->>'status'<>'activated' then raise exception 'judge admission failed'; end if;
 if (select redeemed_count from invites where cohort='attendee')<>1 then raise exception 'capacity incorrect'; end if;
 r:=redeem_invite('00000000-0000-0000-0000-000000000004','invalid'); if r->>'status'<>'invalid' then raise exception 'invalid invite accepted'; end if;
 r:=save_profile(winner,0,'1',null,'{"version":1,"answers":{"note":"saved"}}'::jsonb); if r->'profile'->>'revision'<>'1' then raise exception 'save failed'; end if;
 r:=save_profile(winner,0,'2',null,'{}'::jsonb); if r->>'error'<>'conflict' then raise exception 'stale save accepted'; end if;
end $$;
do $$ begin if has_function_privilege('authenticated','public.redeem_invite(uuid,text)','execute') or has_function_privilege('anon','public.save_profile(uuid,integer,text,text,jsonb)','execute') then raise exception 'untrusted role has privileged RPC'; end if; end $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin if (select count(*) from public.profiles)<>1 then raise exception 'RLS leaked profiles'; end if; end $$;
reset role;
SQL
printf 'PASS: isolated PostgreSQL migration, final-slot race, idempotent activation, judge admission, save conflict and profile RLS.\n'
