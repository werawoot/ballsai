// Isolated PostgreSQL (PGlite), never connects to Supabase or reads .env files.
// PGLITE_MODULE must point to an installed @electric-sql/pglite module.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
// SQL46's overlap guarantee is an exclusion constraint over (court_id, tstzrange),
// which needs btree_gist for the gist uuid opclass.
const { btree_gist } = await import(process.env.PGLITE_BTREE_GIST ?? '@electric-sql/pglite/contrib/btree_gist')
const db = new PGlite({ extensions: { btree_gist } })
// Installed into a schema that is neither public nor extensions, so SQL46 is forced to
// resolve the operator class from the catalog instead of guessing where it lives.
await db.exec('create schema if not exists ext_probe; create extension if not exists btree_gist with schema ext_probe;')
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const athlete = '33333333-3333-4333-8333-333333333333'
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema audit;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
create function public.is_admin() returns boolean language sql stable as $$select false$$;
create table auth.users(id uuid primary key, email text);
-- Columns the applied PDPA deletion function clears; shapes only.
create table public.profiles(id uuid primary key, role text, onboarding_persona text, email text, full_name text, phone text, province text, team text, position text, onboarding_sport text, onboarding_goal text, updated_at timestamptz default now());
create function audit.write_admin_event(text,text,text,text,jsonb,jsonb) returns void language sql as $$select$$;
-- Mirrors sql/17 so SQL18/19/20 can alter it for real instead of failing on a
-- missing column. SQL17 itself is not loaded; only this shape is needed here.
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, notification_type text not null, title text not null, body text not null default '', href text, source_key text not null unique, read_at timestamptz, created_at timestamptz not null default now());
create function public.create_notification(uuid,text,text,text,text,text) returns void language sql as $$insert into public.notifications(user_id,notification_type,title,body,href,source_key) values ($1,$2,$3,$4,$5,$6) on conflict(source_key) do nothing$$;
create function public.close_venue_slot_safely(uuid) returns void language sql as $$select$$;
insert into auth.users values ('${owner}','coach@example.invalid'),('${other}','other@example.invalid'),('${athlete}','athlete@example.invalid');
insert into public.profiles(id, role, onboarding_persona, email) select id, 'user', 'coach_organizer', email from auth.users;
`)
await db.exec(await readFile('sql/23-venues-and-bookings-v1.sql', 'utf8'))
await db.exec(await readFile('sql/40-venue-slot-booking-state-v1.sql', 'utf8'))
const asUser = async id => { await db.query("select set_config('test.uid', $1, false)", [id]); await db.exec('set role authenticated') }
const root = () => db.exec('reset role')
await root()
const venue = (await db.query(`insert into venue_profiles(owner_id,name,province,address,contact_phone) values ($1,'Test venue','Bangkok','Test address','000000000') returning id`, [owner])).rows[0].id
const court = (await db.query(`insert into venue_courts(venue_id,name) values ($1,'Court') returning id`, [venue])).rows[0].id
const migration = await readFile('sql/46-venue-beta-operations-v1.sql', 'utf8').catch(() => '')
if (migration) await db.exec(migration)
await db.exec('grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;')
await asUser(owner)
const manage = (action, id, data) => db.query('select public.manage_venue_beta($1,$2,$3) as result', [action,id,JSON.stringify(data)])
await manage('bulk_slots',court,{ startsAt:'2035-01-01T18:00',endsAt:'2035-01-01T19:00',priceBaht:500,weeks:2 })
await root()
assert.equal((await db.query('select count(*)::int as n from venue_slots')).rows[0].n,2)
assert.equal((await db.query("select to_char(min(starts_at) at time zone 'UTC','YYYY-MM-DD HH24:MI') as t from venue_slots")).rows[0].t,'2035-01-01 11:00')
await asUser(other)
await assert.rejects(manage('bulk_slots',court,{startsAt:'2035-02-01T18:00',endsAt:'2035-02-01T19:00',priceBaht:500,weeks:1}), /NOT_ALLOWED/)
console.log('PASS weekly Thai-time slots and cross-owner denial')

// Database-level backstop. PostgreSQL's Read Committed docs describe snapshots per
// command and say nothing about snapshots per statement inside a PL/pgSQL function, so
// the lock-then-recheck trigger is not a proof. Drop the trigger to stand in for any
// writer that does not go through it -- the applied SQL23/SQL40 RPCs, a psql session,
// or a future regression -- and require the constraint to still refuse the overlap.
// This is a database-enforcement test, not a concurrency test: PGlite is single
// connection, so no assertion here establishes behaviour under real contention.
await root()
const overlapCourt=(await db.query(`insert into venue_courts(venue_id,name) values ($1,'Backstop court') returning id`,[venue])).rows[0].id
await db.query('insert into venue_slots(court_id,starts_at,ends_at,price_baht) values ($1,$2,$3,500)',[overlapCourt,'2036-01-01T10:00Z','2036-01-01T11:00Z'])
await db.exec('alter table public.venue_slots disable trigger venue_slot_overlap_beta;')
let backstop=null
try { await db.query('insert into venue_slots(court_id,starts_at,ends_at,price_baht) values ($1,$2,$3,500)',[overlapCourt,'2036-01-01T10:30Z','2036-01-01T11:30Z']) }
catch(e){ backstop=e.code }
assert.equal(backstop,'23P01','the exclusion constraint must reject the overlap with the trigger disabled')
// An update into an overlapping window must be refused on the same path.
await db.query('insert into venue_slots(court_id,starts_at,ends_at,price_baht) values ($1,$2,$3,500)',[overlapCourt,'2036-01-01T12:00Z','2036-01-01T13:00Z'])
let updateBlocked=null
try { await db.query("update venue_slots set starts_at='2036-01-01T10:15Z', ends_at='2036-01-01T10:45Z' where court_id=$1 and starts_at='2036-01-01T12:00Z'",[overlapCourt]) }
catch(e){ updateBlocked=e.code }
assert.equal(updateBlocked,'23P01','an UPDATE into an occupied window must be refused too')
// Adjacent is legal, a different court is legal, and an owner-blocked slot may overlap.
await db.query('insert into venue_slots(court_id,starts_at,ends_at,price_baht) values ($1,$2,$3,500)',[overlapCourt,'2036-01-01T11:00Z','2036-01-01T12:00Z'])
await db.query("insert into venue_slots(court_id,starts_at,ends_at,price_baht,status) values ($1,$2,$3,500,'blocked')",[overlapCourt,'2036-01-01T10:15Z','2036-01-01T10:45Z'])
await db.exec('alter table public.venue_slots enable trigger venue_slot_overlap_beta;')
// The constraint must have been built from the resolved, schema-qualified operator
// class, not from anything the session search_path happened to expose.
const opclassUsed=(await db.query(`
  select n.nspname as schema, oc.opcname as name
  from pg_constraint con
  join pg_index i on i.indexrelid = con.conindid
  join pg_opclass oc on oc.oid = i.indclass[0]
  join pg_namespace n on n.oid = oc.opcnamespace
  where con.conname = 'venue_slots_no_live_overlap'`)).rows[0]
assert.equal(opclassUsed.schema,'ext_probe','the constraint must use the opclass from the real extension schema')
assert.equal(opclassUsed.name,'gist_uuid_ops')
console.log('PASS exclusion constraint refuses overlap on insert and update even with the trigger disabled, using the catalog-resolved opclass in ext_probe')
await root()
const slots=(await db.query('select id from venue_slots order by starts_at')).rows
await asUser(other)
const booking=(await db.query("select request_venue_booking_safely($1,'Training','') as id",[slots[0].id])).rows[0].id
await asUser(owner)
await db.query("select respond_venue_booking_safely($1,'confirmed')",[booking])
const coordinate=(action,data={})=>db.query('select public.coordinate_venue_booking_beta($1,$2,$3) as result',[action,booking,JSON.stringify(data)])
const proposal=(await coordinate('propose_move',{slotId:slots[1].id,reason:'Change requested'})).rows[0].result
await assert.rejects(coordinate('accept',{proposalId:proposal}),/OTHER_PARTICIPANT_REQUIRED/)
await root()
assert.equal((await db.query('select slot_id from venue_booking_requests where id=$1',[booking])).rows[0].slot_id,slots[0].id)
await asUser(athlete)
await assert.rejects(coordinate('message',{text:'Unauthorized'}),/NOT_ALLOWED/)
await asUser(other)
await coordinate('accept',{proposalId:proposal})
await root()
assert.equal((await db.query('select slot_id from venue_booking_requests where id=$1',[booking])).rows[0].slot_id,slots[1].id)
assert.equal((await db.query('select status from venue_slots where id=$1',[slots[0].id])).rows[0].status,'open')
console.log('PASS confirmed reschedule requires other participant and frees original slot')
await root()
await db.exec(`
create table tournaments(id uuid primary key default gen_random_uuid(),name text,organizer_id uuid,status text,max_teams integer);
create table teams(id uuid primary key default gen_random_uuid(),name text,members text,tournament_id uuid references tournaments,created_by uuid,status text,created_at timestamptz default now());
create table athlete_profiles(user_id uuid primary key references auth.users,display_name text,position text,is_public boolean default false);
create table player_ranks(id uuid primary key default gen_random_uuid(),player_id uuid,player_name text);
create table match_player_performances(id uuid,player_rank_id uuid,team_id uuid);
create table payments(id uuid,team_id uuid);
create function register_team_safely(uuid,text,text) returns void language sql as $$select$$;
insert into athlete_profiles values('${athlete}','Test athlete','GK',false);
`)
// SQL18 replaces notifications_notification_type_check with a list that predates
// 'venue_booking' (SQL41 adds it back, and this harness stubs SQL41). The venue
// assertions above have already run, so clear their rows rather than weakening either
// migration's constraint.
await db.exec('delete from public.notifications;')
await db.exec(await readFile('sql/18-team-members-v1.sql','utf8'))
await db.exec(await readFile('sql/19-notification-team-member-privilege-hardening-v1.sql','utf8'))
await db.exec(await readFile('sql/20-tournament-roster-flow-v1.sql','utf8'))
const tournament=(await db.query("insert into tournaments(name,organizer_id,status,max_teams) values('Test',$1,'open',10) returning id",[other])).rows[0].id
await asUser(owner)
const team=(await db.query("select create_tournament_team_safely($1,'Coach team') as id",[tournament])).rows[0].id
const member=(await db.query("select invite_team_member($1,'athlete@example.invalid') as id",[team])).rows[0].id
await asUser(athlete)
await assert.rejects(db.query("select invite_team_member($1,'coach@example.invalid')",[team]),/NOT_ALLOWED/)
await db.query("select respond_team_invite($1,'accepted')",[member])
console.log('PASS existing SQL20 coach creator can invite without organizer privileges; unrelated account denied')
await root()
// SQL31 references these; only their shape matters for the coach attestation path.
await db.exec(`
create table player_ratings(id uuid primary key default gen_random_uuid(),player_rank_id uuid);
create table rating_events(id uuid primary key default gen_random_uuid(),player_rank_id uuid);
`)
await db.exec(await readFile('sql/31-data-trust-foundation-v1.sql','utf8'))
// Mirrors SQL35: authenticated cannot write ranks directly, only audited RPCs can.
await db.exec('alter table public.player_ranks enable row level security;')
// The applied PDPA chain, loaded for real so SQL47 extends the same function the
// production migrations produced rather than a stand-in.
await db.exec('create table public.athlete_highlights(id uuid primary key default gen_random_uuid(), athlete_id uuid references auth.users(id) on delete cascade, media_path text);')
await db.exec(await readFile('sql/data-deletion-v1.sql','utf8'))
await db.exec(await readFile('sql/33-data-deletion-function-privilege-hardening-v1.sql','utf8'))
await db.exec(await readFile('sql/36-data-deletion-search-path-hardening-v1.sql','utf8'))
const coachMigration=await readFile('sql/47-coach-beta-management-v1.sql','utf8').catch(()=>'')
if(coachMigration)await db.exec(coachMigration)
await asUser(owner)
await db.query('select manage_coach_beta($1,$2,$3)',['remove',team,JSON.stringify({memberId:member})])
await root()
assert.equal((await db.query('select status from team_members where id=$1',[member])).rows[0].status,'removed')
console.log('PASS coach removes own draft roster member')

// A coach must not be able to manage a team they did not create, even though this
// account is a venue owner and a coach persona elsewhere.
await root()
// A separate tournament, so this fixture does not trip SQL20's one-roster-per-athlete
// rule when the coach's own team re-invites the same athlete below.
const tournament2=(await db.query("insert into tournaments(name,organizer_id,status,max_teams) values('Other tournament',$1,'open',10) returning id",[other])).rows[0].id
const foreignTeam=(await db.query("insert into teams(name,tournament_id,created_by,status) values('Other team',$1,$2,'draft') returning id",[tournament2,other])).rows[0].id
const foreignMember=(await db.query("insert into team_members(team_id,athlete_id,invited_by,status) values($1,$2,$3,'accepted') returning id",[foreignTeam,athlete,other])).rows[0].id
await asUser(owner)
await assert.rejects(db.query('select manage_coach_beta($1,$2,$3)',['remove',foreignTeam,JSON.stringify({memberId:foreignMember})]),/NOT_ALLOWED/)
// And must not reach across teams by passing another team's member id.
await assert.rejects(db.query('select manage_coach_beta($1,$2,$3)',['remove',team,JSON.stringify({memberId:foreignMember})]),/MEMBER_NOT_FOUND/)
console.log('PASS coach cannot manage another team or borrow its member id')

// Re-invite and accept so there is an accepted member of the coach's own team.
await asUser(owner)
const member2=(await db.query("select invite_team_member($1,'athlete@example.invalid') as id",[team])).rows[0].id
await asUser(athlete)
await db.query("select respond_team_invite($1,'accepted')",[member2])

// A coach attestation is a claim, not a verification. It must not raise the athlete's
// level until the athlete accepts it.
await asUser(owner)
// Structured: one named field with an explicit value set, never free text.
await assert.rejects(db.query('select attest_coach_claim_beta($1,$2)',[team,JSON.stringify({athleteId:athlete,position:'STRIKER'})]),/INVALID_POSITION/)
await assert.rejects(db.query('select attest_coach_claim_beta($1,$2)',[team,JSON.stringify({athleteId:athlete,position:''})]),/INVALID_POSITION/)
const attestation=(await db.query('select attest_coach_claim_beta($1,$2) as id',[team,JSON.stringify({athleteId:athlete,position:'GK'})])).rows[0].id
await root()
assert.equal((await db.query("select count(*)::int as n from data_provenance where subject_id=$1 and verification_level='coach_verified'",[athlete])).rows[0].n,0)
const pendingRow=(await db.query('select status,field,claimed_value from coach_attestations where id=$1',[attestation])).rows[0]
assert.equal(pendingRow.status,'pending')
assert.equal(pendingRow.field,'playing_position')
assert.equal(pendingRow.claimed_value,'GK')
assert.equal((await db.query('select count(*)::int as n from coach_verified_fields where athlete_id=$1',[athlete])).rows[0].n,0)
console.log('PASS structured position attestation starts pending, rejects values outside GK/DF/MF/FW, and grants no verification')

// Only the athlete may accept, and never the coach who wrote it.
await asUser(owner)
await assert.rejects(db.query('select respond_coach_attestation_beta($1,$2)',[attestation,'accepted']),/ATHLETE_REQUIRED/)
await asUser(other)
await assert.rejects(db.query('select respond_coach_attestation_beta($1,$2)',[attestation,'accepted']),/ATHLETE_REQUIRED/)
await root()
assert.equal((await db.query("select count(*)::int as n from data_provenance where subject_id=$1 and verification_level='coach_verified'",[athlete])).rows[0].n,0)
console.log('PASS neither the coach nor an unrelated account can accept an attestation')

await asUser(athlete)
await db.query('select respond_coach_attestation_beta($1,$2)',[attestation,'accepted'])
await root()
const prov=(await db.query("select id,source_type,verification_level,source_actor_id from data_provenance where subject_id=$1 and verification_level='coach_verified'",[athlete])).rows
assert.equal(prov.length,1)
assert.equal(prov[0].source_type,'coach_verified')
assert.equal(prov[0].source_actor_id,owner)
// Provenance and history are append-only records, so the acceptance must leave a trail.
assert.equal((await db.query("select count(*)::int as n from verification_events where subject_id=$1 and event_type='accepted' and to_level='coach_verified'",[athlete])).rows[0].n,1)
assert.equal((await db.query("select count(*)::int as n from verification_evidence where provenance_id=$1 and evidence_type='coach_attestation'",[prov[0].id])).rows[0].n,1)
// Field-level: the record must name the one field and value that was confirmed, and
// must not imply the whole profile, identity, rating or performance was verified.
const field=(await db.query('select field,verified_value,coach_id,provenance_id from coach_verified_fields where athlete_id=$1',[athlete])).rows
assert.equal(field.length,1)
assert.equal(field[0].field,'playing_position')
assert.equal(field[0].verified_value,'GK')
assert.equal(field[0].coach_id,owner)
assert.equal(field[0].provenance_id,prov[0].id)
const meta=(await db.query('select verification_method,metadata,confidence from data_provenance where id=$1',[prov[0].id])).rows[0]
assert.equal(meta.verification_method,'coach_attestation:playing_position')
assert.equal(meta.metadata.field,'playing_position')
assert.equal(meta.metadata.verified_value,'GK')
assert.equal(meta.metadata.scope,'single_field')
assert.ok(Number(meta.confidence)<=0.6,'one coach-confirmed field is not high confidence')
// Nothing in the rating or performance tables may have moved.
assert.equal((await db.query('select count(*)::int as n from player_ranks')).rows[0].n,0)
assert.equal((await db.query('select count(*)::int as n from match_player_performances')).rows[0].n,0)
console.log('PASS athlete acceptance records field-level playing_position provenance only')

// A coach must never be able to move ratings or performance data directly.
await asUser(owner)
await assert.rejects(db.query("insert into player_ranks(id,player_id) values (gen_random_uuid(),$1)",[athlete]))
await assert.rejects(db.query('select manage_coach_beta($1,$2,$3)',['set_rating',team,JSON.stringify({athleteId:athlete})]),/INVALID_ACTION/)
console.log('PASS coach cannot write ratings or performance data')

// --- admin is not the coach ---------------------------------------------------------
// An admin may fix a roster, but must not produce a coach_verified record for a team
// they do not run: that would represent an administrative act as a coach's own
// knowledge of where the athlete plays.
await root()
await db.exec("create or replace function public.is_admin() returns boolean language sql stable as $$select current_setting('test.uid', true) = '" + other + "'$$;")
await asUser(other)
await assert.rejects(db.query('select attest_coach_claim_beta($1,$2)',[team,JSON.stringify({athleteId:athlete,position:'DF'})]),/NOT_ALLOWED/)
// And the coach RPC grants an admin nothing either. An administrative roster fix here
// would be an unaudited mutation; it has to be a separate approved RPC on the SQL35
// audit trail instead.
await root()
const adminTarget=(await db.query("insert into team_members(team_id,athlete_id,invited_by,status) values($1,$2,$3,'pending') returning id",[team,other,owner])).rows[0].id
await asUser(other)
await assert.rejects(db.query('select manage_coach_beta($1,$2,$3)',['remove',team,JSON.stringify({memberId:adminTarget})]),/NOT_ALLOWED/)
await root()
assert.equal((await db.query('select status from team_members where id=$1',[adminTarget])).rows[0].status,'pending','an admin must not have removed the member')
// The actual team creator still can.
await asUser(owner)
await db.query('select manage_coach_beta($1,$2,$3)',['remove',team,JSON.stringify({memberId:adminTarget})])
await root()
assert.equal((await db.query('select status from team_members where id=$1',[adminTarget])).rows[0].status,'removed')
assert.equal((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='coach_owns_team_beta'")).rows[0].n,0,'the admin-capable helper must not exist')
await db.exec('create or replace function public.is_admin() returns boolean language sql stable as $$select false$$;')
console.log('PASS an admin who did not create the team is denied both attestation and roster removal; only the creator may remove')

// --- no replacement flow, enforced in the database ----------------------------------
await asUser(owner)
const member3=(await db.query("select invite_team_member($1,'athlete@example.invalid') as id",[team])).rows[0].id
await asUser(athlete)
await db.query("select respond_team_invite($1,'accepted')",[member3])
await asUser(owner)
// An accepted attestation already exists for this team+athlete+field from above.
await assert.rejects(db.query('select attest_coach_claim_beta($1,$2)',[team,JSON.stringify({athleteId:athlete,position:'FW'})]),/ATTESTATION_ALREADY_ACCEPTED/)
// A direct insert must hit the unique index rather than slipping past the RPC.
await root()
let live=null
try { await db.query("insert into coach_attestations(team_id,coach_id,athlete_id,field,claimed_value) values($1,$2,$3,'playing_position','MF')",[team,owner,athlete]) }
catch(e){ live=e.code }
assert.equal(live,'23505','coach_attestations_live_idx must refuse a second live attestation')
console.log('PASS an accepted attestation cannot be replaced, by RPC or by direct insert')

// A second team may attest about the same athlete: the rule is per team+athlete+field.
await root()
const team2=(await db.query("insert into teams(name,tournament_id,created_by,status) values('Second team',$1,$2,'draft') returning id",[tournament2,other])).rows[0].id
await db.query("insert into team_members(team_id,athlete_id,invited_by,status) values($1,$2,$3,'accepted')",[team2,athlete,other])
await asUser(other)
const att2=(await db.query('select attest_coach_claim_beta($1,$2) as id',[team2,JSON.stringify({athleteId:athlete,position:'FW'})])).rows[0].id
assert.ok(att2)
// Pending also blocks a repeat on that same team.
await assert.rejects(db.query('select attest_coach_claim_beta($1,$2)',[team2,JSON.stringify({athleteId:athlete,position:'DF'})]),/ATTESTATION_ALREADY_PENDING/)
// A declined one may be resubmitted.
await asUser(athlete)
await db.query('select respond_coach_attestation_beta($1,$2)',[att2,'declined'])
await asUser(other)
const att3=(await db.query('select attest_coach_claim_beta($1,$2) as id',[team2,JSON.stringify({athleteId:athlete,position:'DF'})])).rows[0].id
assert.ok(att3)
console.log('PASS pending and accepted block a repeat, a declined one may be resubmitted, and teams are independent')

// --- PDPA erasure -------------------------------------------------------------------
// A coach's attestation about a DIFFERENT athlete must survive the first athlete's
// erasure, and the append-only history guard must not yield to anyone else.
await root()
const athlete2='44444444-4444-4444-8444-444444444444'
await db.query('insert into auth.users values ($1,$2)',[athlete2,'athlete2@example.invalid'])
await db.query("insert into public.profiles values ($1,'user','coach_organizer')",[athlete2])
await db.query("insert into athlete_profiles values($1,'Second athlete','FW',false)",[athlete2])
await db.query("insert into team_members(team_id,athlete_id,invited_by,status) values($1,$2,$3,'accepted')",[team,athlete2,owner])
await asUser(owner)
const keepAtt=(await db.query('select attest_coach_claim_beta($1,$2) as id',[team,JSON.stringify({athleteId:athlete2,position:'MF'})])).rows[0].id
await asUser(athlete2)
await db.query('select respond_coach_attestation_beta($1,$2)',[keepAtt,'accepted'])

// A browser role has SELECT only on verification_events, so a direct delete is refused
// before the trigger is reached. Assert the outcome, not a particular message.
await asUser(athlete)
await assert.rejects(db.query('delete from verification_events where subject_id=$1',[athlete]))
await asUser(owner)
await assert.rejects(db.query('delete from verification_events where subject_id=$1',[athlete2]))

// The append-only guard is the backstop for anything that DOES hold the privilege.
// As the table owner, without the erasure flag, it must still refuse.
await root()
await assert.rejects(db.query('delete from verification_events where subject_id=$1',[athlete]),/DATA_TRUST_HISTORY_APPEND_ONLY/)
// And with the flag on, it must refuse a subject that is not the caller.
await db.query("select set_config('bds.pdpa_erasure','on',false)")
await db.query("select set_config('test.uid',$1,false)",[athlete])
await assert.rejects(db.query('delete from verification_events where subject_id=$1',[athlete2]),/DATA_TRUST_HISTORY_APPEND_ONLY/)
await db.query("select set_config('bds.pdpa_erasure','off',false)")
await db.query("select set_config('test.uid','',false)")

await root()
const before={
  att:(await db.query('select count(*)::int as n from coach_attestations where athlete_id=$1',[athlete])).rows[0].n,
  fields:(await db.query('select count(*)::int as n from coach_verified_fields where athlete_id=$1',[athlete])).rows[0].n,
  prov:(await db.query("select count(*)::int as n from data_provenance where subject_id=$1 and verification_method='coach_attestation:playing_position'",[athlete])).rows[0].n,
  events:(await db.query('select count(*)::int as n from verification_events where subject_id=$1',[athlete])).rows[0].n,
}
assert.ok(before.att>0 && before.fields>0 && before.prov>0 && before.events>0,'the erasure test needs data to erase')

await asUser(athlete)
const erased=(await db.query('select delete_my_athlete_data() as r')).rows[0].r
await root()
assert.equal((await db.query('select count(*)::int as n from coach_attestations where athlete_id=$1',[athlete])).rows[0].n,0)
assert.equal((await db.query('select count(*)::int as n from coach_verified_fields where athlete_id=$1',[athlete])).rows[0].n,0)
assert.equal((await db.query("select count(*)::int as n from data_provenance where subject_id=$1 and verification_method='coach_attestation:playing_position'",[athlete])).rows[0].n,0)
assert.equal((await db.query('select count(*)::int as n from verification_events where subject_id=$1',[athlete])).rows[0].n,0)
// verification_evidence cascades from data_provenance, so the erased athlete's
// evidence is gone while the other athlete's remains.
assert.equal((await db.query("select count(*)::int as n from verification_evidence e where e.submitted_by=$1 and not exists (select 1 from data_provenance p where p.id=e.provenance_id)",[owner])).rows[0].n,0)
assert.equal((await db.query("select count(*)::int as n from verification_evidence e join data_provenance p on p.id=e.provenance_id where p.subject_id=$1",[athlete2])).rows[0].n,1)
assert.ok(erased.coachAttestationsRemoved>=1,'the result must report what was erased')
assert.ok(erased.coachVerifiedFieldsRemoved>=1)
// The other athlete's verification is untouched, including the coach's record of it.
assert.equal((await db.query('select count(*)::int as n from coach_attestations where athlete_id=$1',[athlete2])).rows[0].n,1)
assert.equal((await db.query('select count(*)::int as n from coach_verified_fields where athlete_id=$1',[athlete2])).rows[0].n,1)
assert.equal((await db.query('select count(*)::int as n from verification_events where subject_id=$1',[athlete2])).rows[0].n,1)
// And the existing SQL16 behaviour still happened.
assert.equal((await db.query('select count(*)::int as n from account_deletion_requests where user_id=$1',[athlete])).rows[0].n,1)
assert.equal((await db.query('select count(*)::int as n from athlete_profiles where user_id=$1',[athlete])).rows[0].n,0)
// The escape hatch is transaction-local, so it must be shut again now.
await root()
await assert.rejects(db.query('delete from verification_events where subject_id=$1',[athlete2]),/DATA_TRUST_HISTORY_APPEND_ONLY/)
console.log('PASS PDPA erasure removes only the requesting athlete\'s coach-attestation records and keeps history append-only for everyone else')

// --- production drift must be refused exactly ---------------------------------------
// A body carrying the same three marker strings but any additional change must be
// rejected: substring checks cannot see an added line that still contains them.
await root()
const sql47=await readFile('sql/47-coach-beta-management-v1.sql','utf8')
const driftGuard=sql47.match(/do \$\$\s*\ndeclare\s*\n\s*v_fingerprint text;[\s\S]*?\n\$\$;/)
assert.ok(driftGuard,'the SQL47 fingerprint guard must be extractable to be tested')
// Sanity: against the body SQL47 already replaced, the guard must now refuse too,
// because the replacement itself changed prosrc.
await assert.rejects(db.exec(driftGuard[0]),/MANUAL RECONCILIATION/)

// Restore the applied SQL16 body, then prove the guard accepts it.
await db.exec(await readFile('sql/data-deletion-v1.sql','utf8'))
await db.exec(driftGuard[0])
// Now drift it by one comment line that keeps every marker, and require a refusal.
const original=await readFile('sql/data-deletion-v1.sql','utf8')
const drifted=original.replace('  select email into v_email from public.profiles where id = v_user_id;',
  '  -- production hotfix note\n  select email into v_email from public.profiles where id = v_user_id;')
assert.notEqual(drifted,original,'the drift fixture must actually differ')
await db.exec(drifted)
const driftedSrc=(await db.query("select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_my_athlete_data'")).rows[0].prosrc
for (const marker of ['account_deletion_requests','ATHLETE REMOVED','highlightPaths']) {
  assert.ok(driftedSrc.includes(marker),`the drift fixture must still contain ${marker}`)
}
await assert.rejects(db.exec(driftGuard[0]),/MANUAL RECONCILIATION/)
console.log('PASS the fingerprint guard refuses a drifted body that still carries all three markers')
await db.close()
