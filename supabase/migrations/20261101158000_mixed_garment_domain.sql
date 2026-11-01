-- Widen the existing admission check without replacing its current auth,
-- revision, live-session, in-flight or shared-budget protections.
do $$
declare definition text;
 old_guard text:=$guard$data->>'garmentDomain' in ('menswear','womenswear')$guard$;
 new_guard text:=$guard$data->>'garmentDomain' in ('menswear','womenswear','mixed')$guard$;
begin
 definition:=pg_get_functiondef('public.start_consultation_generation(uuid,uuid,text)'::regprocedure);
 if position(new_guard in definition)>0 then return;end if;
 if position(old_guard in definition)=0 then raise exception 'Expected garment domain admission guard is absent';end if;
 execute replace(definition,old_guard,new_guard);
end $$;
