-- DRAFT. Target hivedzrwrrcnjrlirhtv only. Requires SQL40,41,42.
-- New migration; do not apply without production approval.
begin;

do $$ begin
  -- Dependencies, and a refusal to apply twice. Without this a re-run would fail
  -- halfway through with a bare duplicate-object error.
  if to_regclass('public.venue_slots') is null or to_regclass('public.venue_booking_requests') is null then
    raise exception 'SQL46 requires the SQL23 venue tables';
  end if;
  if to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null then
    raise exception 'SQL46 requires the SQL17 notification entry point';
  end if;
  if to_regprocedure('public.request_venue_booking_safely(uuid,text,text)') is null then
    raise exception 'SQL46 requires SQL40 booking state';
  end if;
  if to_regclass('public.venue_booking_coordination') is not null
     or to_regprocedure('public.manage_venue_beta(text,uuid,jsonb)') is not null then
    raise exception 'SQL46 is already applied; stop and reconcile state';
  end if;
  -- The overlap guarantee is an exclusion constraint, which needs a gist operator class
  -- for uuid equality. btree_gist supplies it. Supabase does not document btree_gist on
  -- its extensions page, so prove the opclass exists instead of assuming it. Install
  -- with: create extension btree_gist with schema extensions;
  if not exists (
    select 1 from pg_opclass oc join pg_am am on am.oid = oc.opcmethod
    where am.amname = 'gist' and oc.opcintype = 'uuid'::regtype
  ) then
    raise exception 'SQL46 requires btree_gist for a gist uuid opclass; run: create extension btree_gist with schema extensions;';
  end if;
end $$;

-- All slot writers, including older RPCs, take the same court lock and reject
-- overlap. Existing overlaps must be reconciled before this migration.
do $$ begin
  if exists(select 1 from public.venue_slots a join public.venue_slots b
    on a.court_id=b.court_id and a.id<b.id and a.status<>'blocked' and b.status<>'blocked'
    and a.starts_at<b.ends_at and b.starts_at<a.ends_at) then
    raise exception 'EXISTING_SLOT_OVERLAP: STOP and reconcile';
  end if;
end $$;
-- The guarantee. A constraint is enforced by the index for every writer on every
-- path, including the applied SQL23/SQL40 RPCs and any future one, and it does not
-- depend on when a PL/pgSQL statement takes its snapshot. Half-open ranges let one
-- slot start exactly when the previous ends. Owner-blocked slots are excluded so a
-- blocked period can still be replaced, which matches the SQL40 lifecycle.
--
-- The gist uuid operator class comes from btree_gist, which Supabase lets an operator
-- install into public, extensions, or a schema of their choosing. Rather than guess,
-- resolve the exact schema and name from the catalog and build the DDL with dynamic
-- SQL. The range function and the overlap operator are pinned to pg_catalog. The
-- result does not depend on the session search_path at apply time. Verify the resolved
-- pair against the 46 precheck output before applying.
do $$
declare
  v_schema text;
  v_opclass text;
  v_count integer;
begin
  -- Exactly one usable operator class, or this transaction stops. The precheck reports
  -- the same count, but nothing here depends on an operator having read it: zero means
  -- btree_gist is missing, and more than one means the catalog is ambiguous and a human
  -- must choose before an index is built on it.
  select count(*) into v_count
  from pg_opclass oc
  join pg_am am on am.oid = oc.opcmethod
  where am.amname = 'gist' and oc.opcintype = 'uuid'::regtype;

  if v_count <> 1 then
    raise exception 'SQL46 needs exactly one gist operator class for uuid but found %. Zero: install btree_gist (create extension btree_gist with schema extensions;). More than one: reconcile the catalog and re-run the 46 precheck. Never substitute a weaker guard.', v_count;
  end if;

  select n.nspname, oc.opcname into v_schema, v_opclass
  from pg_opclass oc
  join pg_am am on am.oid = oc.opcmethod
  join pg_namespace n on n.oid = oc.opcnamespace
  where am.amname = 'gist' and oc.opcintype = 'uuid'::regtype;

  if v_schema is null or v_opclass is null then
    raise exception 'SQL46 could not resolve the gist uuid operator class schema; stop and reconcile';
  end if;
  raise notice 'SQL46 exclusion constraint using operator class %.%', v_schema, v_opclass;

  execute format(
    'alter table public.venue_slots add constraint venue_slots_no_live_overlap '
    'exclude using gist (court_id %I.%I with =, '
    'pg_catalog.tstzrange(starts_at, ends_at, ''[)'') with operator(pg_catalog.&&)) '
    'where (status <> ''blocked'')',
    v_schema, v_opclass);
end $$;

-- Kept for the readable error and the court lock. It is a convenience, not the
-- guarantee: the constraint above is what cannot be raced.
create function public.guard_venue_slot_overlap_beta() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.venue_courts where id=new.court_id for update;
  if new.status <> 'blocked' and exists(select 1 from public.venue_slots s
    where s.court_id=new.court_id and s.id<>new.id and s.status<>'blocked'
    and s.starts_at<new.ends_at and new.starts_at<s.ends_at) then
    raise exception 'SLOT_OVERLAP' using errcode='23P01';
  end if;
  return new;
end $$;
create trigger venue_slot_overlap_beta before insert or update of starts_at,ends_at,court_id,status
on public.venue_slots for each row execute function public.guard_venue_slot_overlap_beta();
revoke all on function public.guard_venue_slot_overlap_beta() from public,anon,authenticated,service_role;

create function public.manage_venue_beta(p_action text,p_id uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_court uuid; v_start timestamptz; v_end timestamptz;
v_weeks integer; v_price integer; v_ids jsonb:='[]'; v_id uuid; i integer;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
  if p_action='venue' then
    select owner_id into v_owner from public.venue_profiles where id=p_id for update;
  elsif p_action in ('court','bulk_slots') then
    select v.owner_id,c.id into v_owner,v_court from public.venue_courts c join public.venue_profiles v on v.id=c.venue_id where c.id=p_id;
  elsif p_action='slot' then
    select v.owner_id,c.id into v_owner,v_court from public.venue_slots s join public.venue_courts c on c.id=s.court_id join public.venue_profiles v on v.id=c.venue_id where s.id=p_id;
  else raise exception 'INVALID_ACTION'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
  if v_court is not null then perform 1 from public.venue_courts where id=v_court for update; end if;
  if p_action='venue' then
    update public.venue_profiles set name=btrim(p_data->>'name'),province=btrim(p_data->>'province'),
      address=btrim(p_data->>'address'),contact_phone=btrim(p_data->>'contactPhone'),
      description=coalesce(p_data->>'description',''),updated_at=now() where id=p_id;
  elsif p_action='court' then
    update public.venue_courts set name=btrim(p_data->>'name'),sport=p_data->>'sport',
      surface=coalesce(p_data->>'surface',''),capacity=nullif(p_data->>'capacity','')::integer where id=p_id;
  else
    if coalesce(p_data->>'startsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
      or coalesce(p_data->>'endsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_LOCAL_TIME'; end if;
    v_start:=(p_data->>'startsAt')::timestamp at time zone 'Asia/Bangkok';
    v_end:=(p_data->>'endsAt')::timestamp at time zone 'Asia/Bangkok';
    v_price:=(p_data->>'priceBaht')::integer;
    if v_start<=now() or v_end<=v_start or v_end-v_start>interval '24 hours' or v_price is null or v_price not between 0 and 100000 then raise exception 'INVALID_SLOT'; end if;
    if p_action='slot' then
      perform 1 from public.venue_slots where id=p_id and status='open' and starts_at>now() for update;
      if not found or exists(select 1 from public.venue_booking_requests where slot_id=p_id and status in ('pending','confirmed')) then raise exception 'SLOT_CHANGED' using errcode='55000'; end if;
      update public.venue_slots set starts_at=v_start,ends_at=v_end,price_baht=v_price where id=p_id;
    else
      v_weeks:=coalesce((p_data->>'weeks')::integer,1);
      if v_weeks not between 1 and 12 then raise exception 'INVALID_WEEKS'; end if;
      for i in 0..v_weeks-1 loop
        insert into public.venue_slots(court_id,starts_at,ends_at,price_baht)
        values(v_court,v_start+i*interval '168 hours',v_end+i*interval '168 hours',v_price) returning id into v_id;
        v_ids:=v_ids||jsonb_build_array(v_id);
      end loop;
      return v_ids;
    end if;
  end if;
  return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.manage_venue_beta(text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.manage_venue_beta(text,uuid,jsonb) to authenticated;
create function public.venue_booking_participant_beta(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.venue_booking_requests b join public.venue_slots s on s.id=b.slot_id
    join public.venue_courts c on c.id=s.court_id join public.venue_profiles v on v.id=c.venue_id
    where b.id=p_id and auth.uid() in (b.requester_id,v.owner_id))
$$;
revoke all on function public.venue_booking_participant_beta(uuid) from public,anon,service_role;
grant execute on function public.venue_booking_participant_beta(uuid) to authenticated;

create table public.venue_booking_coordination (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.venue_booking_requests(id),
  actor_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('message','propose_cancel','propose_move')),
  body text not null check(char_length(btrim(body)) between 3 and 600),
  target_slot_id uuid references public.venue_slots(id),
  original_slot_id uuid not null references public.venue_slots(id),
  original_snapshot jsonb not null,
  target_snapshot jsonb,
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index venue_coordination_booking_idx on public.venue_booking_coordination(booking_id,created_at);
create unique index venue_coordination_pending_idx on public.venue_booking_coordination(booking_id)
  where kind<>'message' and status='pending';
alter table public.venue_booking_coordination enable row level security;
revoke all on public.venue_booking_coordination from anon,authenticated;
grant select on public.venue_booking_coordination to authenticated;
create policy venue_coordination_participants on public.venue_booking_coordination for select to authenticated
using(public.venue_booking_participant_beta(booking_id));

create function public.coordinate_venue_booking_beta(p_action text,p_id uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.venue_booking_requests%rowtype; s public.venue_slots%rowtype;
  proposal public.venue_booking_coordination%rowtype; v_owner uuid; v_venue uuid;
  v_target uuid; v_id uuid; v_other uuid; v_body text; v_court_name text;
begin
  if not public.venue_booking_participant_beta(p_id) then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
  select * into b from public.venue_booking_requests where id=p_id;
  if p_action in ('accept','reject') then
    select * into proposal from public.venue_booking_coordination where id=(p_data->>'proposalId')::uuid and booking_id=p_id;
    v_target:=proposal.target_slot_id;
  elsif p_action='propose_move' then v_target:=(p_data->>'slotId')::uuid; end if;
  -- Court before slot; all involved resources sorted consistently.
  perform 1 from public.venue_courts where id in (select court_id from public.venue_slots where id in (b.slot_id,v_target)) order by id for update;
  perform 1 from public.venue_slots where id in (b.slot_id,v_target) order by id for update;
  perform 1 from public.venue_booking_requests where id=p_id for update;
  if exists(select 1 from public.venue_booking_requests where id=p_id and slot_id<>b.slot_id) then raise exception 'BOOKING_CHANGED' using errcode='40001'; end if;
  select * into b from public.venue_booking_requests where id=p_id;
  select v.owner_id,v.id into v_owner,v_venue from public.venue_slots x join public.venue_courts c on c.id=x.court_id join public.venue_profiles v on v.id=c.venue_id where x.id=b.slot_id;
  v_other:=case when auth.uid()=v_owner then b.requester_id else v_owner end;
  if p_action='message' then
    if b.status not in ('pending','confirmed') then raise exception 'BOOKING_CLOSED'; end if;
    if (select count(*) from public.venue_booking_coordination where booking_id=p_id and actor_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'RATE_LIMIT'; end if;
    v_body:=btrim(p_data->>'text');
  else
    if b.status<>'confirmed' or b.slot_starts_at_snapshot<=now() then raise exception 'BOOKING_CHANGED' using errcode='55000'; end if;
    v_body:=btrim(p_data->>'reason');
  end if;
  if p_action in ('message','propose_cancel','propose_move') then
    if v_target is not null then
      select x.* into s from public.venue_slots x join public.venue_courts c on c.id=x.court_id
      join public.venue_profiles v on v.id=c.venue_id where x.id=v_target and c.venue_id=v_venue and c.is_active and v.is_published;
      if s.id is null or s.status<>'open' or s.starts_at<=now() or s.id=b.slot_id then raise exception 'SLOT_CHANGED' using errcode='55000'; end if;
      select name into v_court_name from public.venue_courts where id=s.court_id;
    elsif p_action='propose_move' then raise exception 'TARGET_REQUIRED'; end if;
    -- Snapshot the agreed facts only. to_jsonb(b) would copy the requester's purpose,
    -- note and id into a second table; the audit needs the slot, time and price.
    insert into public.venue_booking_coordination(booking_id,actor_id,kind,body,target_slot_id,original_slot_id,original_snapshot,target_snapshot)
    values(p_id,auth.uid(),p_action,v_body,v_target,b.slot_id,
      jsonb_build_object('slot_id',b.slot_id,'status',b.status,'court_name',b.court_name_snapshot,
        'starts_at',b.slot_starts_at_snapshot,'ends_at',b.slot_ends_at_snapshot,'price_baht',b.price_baht_snapshot),
      case when v_target is null then null else jsonb_build_object('id',s.id,'name',v_court_name,
        'starts_at',s.starts_at,'ends_at',s.ends_at,'price_baht',s.price_baht,'status',s.status) end) returning id into v_id;
  elsif p_action in ('accept','reject') then
    select * into proposal from public.venue_booking_coordination where id=proposal.id for update;
    if proposal.id is null or proposal.kind='message' or proposal.status<>'pending' or proposal.original_slot_id<>b.slot_id then raise exception 'PROPOSAL_CHANGED' using errcode='55000'; end if;
    if proposal.actor_id=auth.uid() then raise exception 'OTHER_PARTICIPANT_REQUIRED' using errcode='42501'; end if;
    v_id:=proposal.id;
    if p_action='accept' and proposal.kind='propose_move' then
      select * into s from public.venue_slots where id=v_target;
      select name into v_court_name from public.venue_courts where id=s.court_id;
      -- Compare the same agreed fields that were proposed, so an unrelated column
      -- change does not void a valid proposal and a changed time still does.
      if s.status<>'open' or s.starts_at<=now()
        or jsonb_build_object('id',s.id,'name',v_court_name,'starts_at',s.starts_at,'ends_at',s.ends_at,'price_baht',s.price_baht,'status',s.status)
           is distinct from proposal.target_snapshot
        or not exists(select 1 from public.venue_courts c join public.venue_profiles v on v.id=c.venue_id where c.id=s.court_id and c.venue_id=v_venue and c.is_active and v.is_published)
        then raise exception 'TARGET_CHANGED' using errcode='55000'; end if;
      update public.venue_slots set status='reserved' where id=v_target;
      update public.venue_booking_requests set slot_id=v_target,court_name_snapshot=v_court_name,
        slot_starts_at_snapshot=s.starts_at,slot_ends_at_snapshot=s.ends_at,price_baht_snapshot=s.price_baht where id=p_id;
      update public.venue_slots set status='open' where id=b.slot_id;
    elsif p_action='accept' and proposal.kind='propose_cancel' then
      update public.venue_booking_requests set status='cancelled',cancelled_at=now() where id=p_id;
      update public.venue_slots set status='open' where id=b.slot_id;
    end if;
    update public.venue_booking_coordination set status=case when p_action='accept' then 'accepted' else 'rejected' end,resolved_by=auth.uid(),resolved_at=now() where id=v_id;
  else raise exception 'INVALID_ACTION'; end if;
  perform public.create_notification(v_other,'venue_booking','มีการประสานงานการจอง','เปิดรายการเพื่อตรวจข้อความหรือข้อเสนอใหม่','/venues/bookings/'||p_id::text,'venue_coordination:'||v_id::text||':'||p_action);
  return to_jsonb(v_id);
end $$;
revoke all on function public.coordinate_venue_booking_beta(text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.coordinate_venue_booking_beta(text,uuid,jsonb) to authenticated;
create function public.venue_booking_options_beta(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_venue uuid; result jsonb;
begin
  if not public.venue_booking_participant_beta(p_id) then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
  select c.venue_id into v_venue from public.venue_booking_requests b join public.venue_slots s on s.id=b.slot_id join public.venue_courts c on c.id=s.court_id where b.id=p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',c.name,'starts_at',s.starts_at,'ends_at',s.ends_at,'price_baht',s.price_baht) order by s.starts_at),'[]') into result
  from public.venue_slots s join public.venue_courts c on c.id=s.court_id join public.venue_profiles v on v.id=c.venue_id
  where c.venue_id=v_venue and c.is_active and v.is_published and s.status='open' and s.starts_at>now();
  return result;
end $$;
revoke all on function public.venue_booking_options_beta(uuid) from public,anon,service_role;
grant execute on function public.venue_booking_options_beta(uuid) to authenticated;
do $$
declare
  v_missing text;
begin
  -- Prove the intended shape rather than trusting the statements above. PostgreSQL
  -- grants PUBLIC execute on a new function, so a missed revoke is otherwise silent.
  -- Any raise here rolls the whole migration back.
  if has_function_privilege('anon','public.manage_venue_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('service_role','public.manage_venue_beta(text,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.manage_venue_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.coordinate_venue_booking_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('service_role','public.coordinate_venue_booking_beta(text,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.coordinate_venue_booking_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.venue_booking_options_beta(uuid)','execute')
     or has_function_privilege('service_role','public.venue_booking_options_beta(uuid)','execute')
     or not has_function_privilege('authenticated','public.venue_booking_options_beta(uuid)','execute')
     or has_function_privilege('anon','public.venue_booking_participant_beta(uuid)','execute')
     or has_function_privilege('service_role','public.venue_booking_participant_beta(uuid)','execute')
     or not has_function_privilege('authenticated','public.venue_booking_participant_beta(uuid)','execute') then
    raise exception 'SQL46 privilege shape is wrong; stop and reconcile';
  end if;

  -- Trigger-only helper: no browser role may call it directly.
  if has_function_privilege('anon','public.guard_venue_slot_overlap_beta()','execute')
     or has_function_privilege('authenticated','public.guard_venue_slot_overlap_beta()','execute')
     or has_function_privilege('service_role','public.guard_venue_slot_overlap_beta()','execute') then
    raise exception 'SQL46 trigger helper must not be executable by a browser role';
  end if;

  -- Every definer function must carry an empty search_path.
  select string_agg(p.proname, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('manage_venue_beta','coordinate_venue_booking_beta',
                      'venue_booking_options_beta','venue_booking_participant_beta',
                      'guard_venue_slot_overlap_beta')
    -- PostgreSQL stores an empty search_path as search_path="" (quoted), so compare the
    -- parsed value rather than an exact string: an exact match would abort a correct
    -- migration.
    and (not p.prosecdef or p.proconfig is null
         or not exists (
           select 1 from unnest(p.proconfig) as cfg
           where cfg like 'search_path=%'
             and btrim(split_part(cfg, '=', 2), '"''') = ''
         ));
  if v_missing is not null then
    raise exception 'SQL46 definer settings are wrong for: %', v_missing;
  end if;

  -- Table grants: read-only to authenticated, nothing to anon or service_role.
  if has_table_privilege('anon','public.venue_booking_coordination','select')
     or has_table_privilege('service_role','public.venue_booking_coordination','select')
     or has_table_privilege('authenticated','public.venue_booking_coordination','insert')
     or has_table_privilege('authenticated','public.venue_booking_coordination','update')
     or has_table_privilege('authenticated','public.venue_booking_coordination','delete')
     or not has_table_privilege('authenticated','public.venue_booking_coordination','select') then
    raise exception 'SQL46 coordination table privileges are wrong; stop and reconcile';
  end if;

  -- RLS posture: enabled, and SELECT is the only policy command.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.venue_booking_coordination'::regclass and c.relrowsecurity) then
    raise exception 'SQL46 left RLS disabled on venue_booking_coordination';
  end if;
  select string_agg(policyname, ', ') into v_missing
  from pg_policies
  where schemaname = 'public' and tablename = 'venue_booking_coordination' and cmd <> 'SELECT';
  if v_missing is not null then
    raise exception 'SQL46 created a non-SELECT policy: %', v_missing;
  end if;

  -- The overlap guarantee must actually be present as a constraint.
  if not exists (select 1 from pg_constraint
                 where conname = 'venue_slots_no_live_overlap'
                   and conrelid = 'public.venue_slots'::regclass and contype = 'x') then
    raise exception 'SQL46 exclusion constraint is missing; stop and reconcile';
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
