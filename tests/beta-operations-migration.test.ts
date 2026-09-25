import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')

const MIGRATIONS = [
  { n: 46, file: '46-venue-beta-operations-v1.sql', pre: '46-venue-beta-operations-precheck.sql', post: '46-venue-beta-operations-postcheck.sql' },
  { n: 47, file: '47-coach-beta-management-v1.sql', pre: '47-coach-beta-management-precheck.sql', post: '47-coach-beta-management-postcheck.sql' },
]

const executableLines = (name: string) => read(name)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .filter(line => line.trim().length > 0)

// SQL46 closes bodies with `end $$;` and SQL47 with `end;\n$$;`; match either.
const definerBodies = (sql: string) =>
  [...sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)[\s\S]*?\$\$;/g)]

const fnBody = (sql: string, name: string) =>
  sql.match(new RegExp(`create (?:or replace )?function public\\.${name}[\\s\\S]*?\\$\\$;`))?.[0] ?? ''

describe.each(MIGRATIONS)('SQL$n structure', ({ file, pre, post }) => {
  const sql = () => read(file)

  it('runs in one transaction', () => {
    expect(sql()).toMatch(/^begin;/m)
    expect(sql().trimEnd()).toMatch(/commit;$/)
  })

  it('refuses to run unless its dependencies exist and it has not already been applied', () => {
    const guard = sql().match(/do \$\$[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(guard).toContain('raise exception')
    expect(guard).toMatch(/to_regclass|to_regprocedure/)
  })

  it('never edits an applied migration by redefining its objects', () => {
    // Applied SQL18/20/23/31/40/41/42 objects must not be dropped or replaced here.
    for (const applied of [
      'request_venue_booking_safely', 'respond_venue_booking_safely', 'close_venue_slot_safely',
      'invite_team_member', 'respond_team_invite', 'create_tournament_team_safely',
      'submit_tournament_team_safely', 'create_notification', 'open_data_dispute_safely',
    ]) {
      expect(sql(), `${applied} must not be redefined`).not.toMatch(
        new RegExp(`(create (or replace )?function|drop function)[^;]*${applied}`),
      )
    }
    expect(sql()).not.toContain('drop table')
    expect(sql()).not.toContain('drop policy')
  })

  it('gives every SECURITY DEFINER function an empty search_path', () => {
    const bodies = definerBodies(sql())
    expect(bodies.length).toBeGreaterThan(0)
    for (const [body, name] of bodies) {
      if (!body.includes('security definer')) continue
      expect(body, `${name} needs an empty search_path`).toMatch(/set search_path\s*=\s*''/)
    }
  })

  it('schema-qualifies every relation inside a definer function', () => {
    for (const [body, name] of definerBodies(sql())) {
      if (!body.includes('security definer')) continue
      // With an empty search_path an unqualified table reference cannot resolve.
      // Comments mention table names in prose, and `do update set` is not a relation.
      const code = body.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
      const froms = [...code.matchAll(/\b(?:from|join|into|update|insert into)\s+([a-z_][\w.]*)/g)]
        .filter(match => !['of', 'set'].includes(match[1]))
        .map(match => match[1])
        .filter(target => !['public', 'auth', 'audit'].includes(target.split('.')[0]))
        // A record variable's field (proposal.target_snapshot) is not a relation.
        .filter(target => !/^(b|s|a|proposal|result|prov|v_\w*)\./.test(target))
        // PL/pgSQL locals and record targets are not relations.
        .filter(target => !/^(v_|b$|s$|a$|proposal$|result$|prov)/.test(target))
      expect(froms, `${name} has unqualified relations`).toEqual([])
    }
  })

  it('denies anon and service_role while granting authenticated', () => {
    const grants = sql().split('\n').filter(line => /^(grant|revoke)/.test(line.trim()))
    expect(grants.length).toBeGreaterThan(0)
    for (const line of grants) {
      if (line.trim().startsWith('grant execute')) {
        expect(line, 'execute may only be granted to authenticated').toMatch(/to authenticated;?$/)
      }
    }
    expect(sql()).toMatch(/revoke all on function[\s\S]*?from public, ?anon/)
  })

  it('never grants a browser role write access to a new table', () => {
    for (const line of sql().split('\n')) {
      if (!/^grant/.test(line.trim())) continue
      expect(line).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table/)
    }
  })

  it('proves its own privilege shape instead of trusting the grant statements', () => {
    expect(sql()).toContain('has_function_privilege')
  })

  it('checks all three roles for every exposed rpc, and rolls back if any is wrong', () => {
    const code = sql().split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    // Every function this migration grants to authenticated must be asserted for all
    // three roles, or a missed revoke ships silently.
    const exposed = [...code.matchAll(/grant execute on function (public\.\w+)\(([^)]*)\) to authenticated/g)]
      .map(match => `${match[1]}(${match[2].replace(/\s+/g, '')})`)
    expect(exposed.length).toBeGreaterThan(0)
    const checkBlock = code.match(/has_function_privilege[\s\S]*?raise exception[^;]*;/)?.[0] ?? ''
    for (const signature of exposed) {
      for (const role of ['anon', 'service_role', 'authenticated']) {
        expect(checkBlock, `${signature} must be asserted for ${role}`)
          .toContain(`has_function_privilege('${role}','${signature}','execute')`)
      }
    }
  })

  it('verifies table grants and RLS posture for every table it creates', () => {
    const code = sql().split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    const created = [...code.matchAll(/create table (public\.\w+)/g)].map(match => match[1])
    for (const table of created) {
      expect(code, `${table} needs RLS enabled`).toContain(`alter table ${table} enable row level security`)
      expect(code, `${table} grants must be asserted`).toContain(`has_table_privilege('anon','${table}','select')`)
      expect(code, `${table} insert grant must be asserted`).toContain(`has_table_privilege('authenticated','${table}','insert')`)
      expect(code, `${table} RLS posture must be asserted`).toMatch(
        new RegExp(`relrowsecurity[\\s\\S]*?${table.replace('.', '\\.')}|${table.replace('.', '\\.')}[\\s\\S]*?relrowsecurity`),
      )
    }
  })

  it('ships read-only precheck and postcheck scripts', () => {
    for (const name of [pre, post]) {
      const statements = executableLines(name)
      expect(statements.some(line => line.trimStart().startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line, `${name} must stay read-only`).not.toMatch(
          /^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i,
        )
      }
    }
  })

  it('has a precheck that refuses a second apply', () => {
    expect(read(pre)).toMatch(/is null as \w*absent/)
    expect(read(pre)).toContain('hivedzrwrrcnjrlirhtv')
  })

  it('has a postcheck that verifies definer settings and effective privileges', () => {
    expect(read(post)).toContain('prosecdef')
    expect(read(post)).toContain('proconfig')
    expect(read(post)).toContain('has_function_privilege')
    expect(read(post)).toContain("has_function_privilege('anon'")
  })
})

describe('SQL46 venue operations', () => {
  const sql = read('46-venue-beta-operations-v1.sql')

  it('refuses to apply while overlapping live availability exists', () => {
    expect(sql).toContain('EXISTING_SLOT_OVERLAP')
  })

  it('locks the court row before checking overlap, so two concurrent inserts serialize', () => {
    const trigger = fnBody(sql, 'guard_venue_slot_overlap_beta')
    expect(trigger).toContain('from public.venue_courts where id=new.court_id for update')
    // The recheck must be a separate statement so Read Committed takes a fresh snapshot.
    expect(trigger.indexOf('for update')).toBeLessThan(trigger.indexOf('SLOT_OVERLAP'))
  })

  it('backs the trigger with a database-enforced exclusion constraint', () => {
    // PostgreSQL's Read Committed documentation describes snapshots per command and
    // says nothing about snapshots per statement inside a PL/pgSQL function, so the
    // lock-then-recheck trigger cannot be *proven* safe against a concurrent insert on
    // a court row that does not yet have a matching slot. The constraint is the
    // guarantee; the trigger only supplies the friendly message.
    // Built with dynamic SQL, so the assertions are on the emitted DDL string.
    expect(sql).toMatch(/exclude using gist/i)
    expect(sql).toContain('venue_slots_no_live_overlap')
    expect(sql).toContain("tstzrange(starts_at, ends_at, ''[)'')")
    expect(sql).toContain('court_id %I.%I with =')
    // Half-open ranges must let an adjacent slot start exactly when the previous ends.
    expect(sql).not.toContain("''[]''")
  })

  it('applies the exclusion only to live availability, matching the slot lifecycle', () => {
    const emitted = sql.match(/exclude using gist[\s\S]*?\)',/i)?.[0] ?? ''
    expect(emitted, 'the emitted DDL must be findable').toBeTruthy()
    // Quotes are doubled inside the format() string.
    expect(emitted).toMatch(/where \(status <> ''blocked''\)/)
  })

  it('resolves the operator class from the catalog instead of guessing its schema', () => {
    // btree_gist may live in public, extensions, or an operator-chosen schema. The
    // constraint is therefore built with dynamic SQL from the resolved catalog entry,
    // so it does not depend on the session search_path at apply time.
    const block = sql.match(/do \$\$[\s\S]*?venue_slots_no_live_overlap[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(block, 'the constraint must be added from a resolving block').toBeTruthy()
    expect(block).toMatch(/from pg_opclass/)
    expect(block).toMatch(/join pg_namespace/)
    expect(block).toContain('execute format(')
    expect(block).toContain('%I.%I with =')
    // Never a hardcoded schema for the extension.
    expect(block).not.toMatch(/public\.gist_uuid_ops|extensions\.gist_uuid_ops/)
  })

  it('schema-qualifies the range function and overlap operator too', () => {
    const block = sql.match(/do \$\$[\s\S]*?venue_slots_no_live_overlap[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(block).toContain('pg_catalog.tstzrange')
    expect(block).toContain('operator(pg_catalog.&&)')
  })

  it('aborts in its own transaction unless exactly one usable opclass resolves', () => {
    const block = sql.match(/do \$\$[\s\S]*?venue_slots_no_live_overlap[\s\S]*?\$\$;/)?.[0] ?? ''
    // The precheck reports the count, but the migration must not depend on anyone
    // having read it: zero and more-than-one both have to stop the transaction here.
    expect(block).toMatch(/count\(\*\)/)
    expect(block).toMatch(/<> 1|!= 1|> 1/)
    expect(block).not.toMatch(/limit 1/)
  })

  it('stops with an explanation when no gist uuid operator class exists', () => {
    const block = sql.match(/do \$\$[\s\S]*?venue_slots_no_live_overlap[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(block).toContain('raise exception')
    expect(block).toContain('btree_gist')
  })

  it('refuses to apply unless the gist opclass for uuid equality exists', () => {
    // btree_gist supplies it. Supabase does not document it on the extensions page, so
    // the migration must prove it is installed rather than assume it.
    expect(sql).toContain('btree_gist')
    expect(sql).toMatch(/pg_opclass/)
    expect(sql).toMatch(/opcintype\s*=\s*'uuid'::regtype/)
  })

  it('guards every slot write path with a trigger, not only the new RPC', () => {
    expect(sql).toMatch(/create trigger venue_slot_overlap_beta\s+before insert or update/)
    expect(sql).toContain('on public.venue_slots')
  })

  it('never lets a participant rewrite a confirmed booking without the other side', () => {
    const fn = fnBody(sql, 'coordinate_venue_booking_beta')
    expect(fn).toContain('OTHER_PARTICIPANT_REQUIRED')
    expect(fn).toContain('proposal.actor_id=auth.uid()')
  })

  it('scopes coordination to the two participants only', () => {
    const helper = fnBody(sql, 'venue_booking_participant_beta')
    expect(helper).toContain('b.requester_id')
    expect(helper).toContain('v.owner_id')
    // Scoped by the two resource relationships, never by a global profiles.role.
    expect(helper).not.toMatch(/\bpublic\.profiles\b/)
    expect(helper).not.toContain('role')
  })

  it('preserves the original agreement as a snapshot rather than overwriting history', () => {
    expect(sql).toContain('original_snapshot jsonb not null')
    expect(sql).toContain('original_slot_id')
  })

  it('snapshots the agreement facts without copying the requester\u2019s private text', () => {
    // to_jsonb(b) would freeze purpose, note and requester_id into a second table.
    // The audit needs the agreed slot, time and price, not the requester's note.
    const fn = fnBody(sql, 'coordinate_venue_booking_beta')
    // Executable SQL only: the comment recording what this replaced is documentation.
    const code = fn.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).not.toContain('to_jsonb(b)')
    const snapshot = fn.match(/jsonb_build_object\([^;]*?'price_baht'[^;]*?\)/)?.[0] ?? ''
    expect(snapshot, 'the original snapshot must be built field by field').toBeTruthy()
    for (const field of ['note', 'purpose', 'requester_id']) {
      expect(snapshot, `${field} must not enter the coordination snapshot`).not.toContain(field)
    }
    for (const field of ['slot_id', 'starts_at', 'ends_at', 'price_baht', 'status']) {
      expect(snapshot, `${field} is audit-relevant and must be kept`).toContain(field)
    }
  })

  it('keeps one live proposal per booking', () => {
    expect(sql).toMatch(/create unique index venue_coordination_pending_idx[\s\S]*?where kind<>'message' and status='pending'/)
  })
})

describe('SQL46 precheck reporting', () => {
  const precheck = read('46-venue-beta-operations-precheck.sql')

  it('reports whether btree_gist is installed and in which schema', () => {
    expect(precheck).toContain('pg_extension')
    expect(precheck).toMatch(/btree_gist_installed/)
    expect(precheck).toMatch(/btree_gist_schema/)
  })

  it('reports the exact gist uuid operator class schema and name', () => {
    expect(precheck).toMatch(/opclass_schema/)
    expect(precheck).toMatch(/opclass_name/)
    expect(precheck).toContain('pg_opclass')
    expect(precheck).toContain("opcintype = 'uuid'::regtype")
  })

  it('reports the existing overlap count, not only the offending rows', () => {
    expect(precheck).toMatch(/overlapping_live_slot_pairs/)
  })

  it('reports row count and table size so the lock risk can be reviewed', () => {
    // Adding an exclusion constraint builds an index and holds a lock on the table.
    expect(precheck).toMatch(/venue_slots_rows/)
    expect(precheck).toMatch(/pg_total_relation_size|pg_size_pretty/)
    expect(precheck).toMatch(/lock/i)
  })

  it('states plainly that passing authorizes nothing', () => {
    expect(precheck).toMatch(/authorises nothing|authorizes nothing/i)
  })
})

describe('SQL47 coach management', () => {
  const sql = read('47-coach-beta-management-v1.sql')

  it('authorises a coach by the team they created, never by a global role', () => {
    const helper = fnBody(sql, 'is_team_creator_beta')
    expect(helper).toContain('t.created_by = auth.uid()')
    expect(helper).not.toContain('onboarding_persona')
    expect(helper).not.toContain("role = 'organizer'")
    // Organizer reach belongs to SQL20, not to a coach capability.
    expect(helper).not.toContain('organizer_id')
  })

  it('confers nothing until the athlete accepts', () => {
    const attest = fnBody(sql, 'attest_coach_claim_beta')
    expect(attest).not.toContain('data_provenance')
    expect(attest).not.toContain('coach_verified')
  })

  it('creates coach_verified provenance only on the athlete’s own acceptance', () => {
    const respond = fnBody(sql, 'respond_coach_attestation_beta')
    expect(respond).toContain('ATHLETE_REQUIRED')
    expect(respond).toContain('a.athlete_id is distinct from auth.uid()')
    expect(respond).toContain("'coach_verified'")
    expect(respond).toContain('public.verification_events')
    expect(respond).toContain('public.verification_evidence')
  })

  it('records provenance and history as new rows, never as an update', () => {
    const respond = fnBody(sql, 'respond_coach_attestation_beta')
    expect(respond).toContain('insert into public.data_provenance')
    expect(respond).not.toMatch(/update public\.(data_provenance|verification_events|verification_evidence)/)
  })

  it('never touches ratings, performances or match results from a coach action', () => {
    // Scoped to the coach capabilities. The PDPA deletion function this migration also
    // extends does anonymise player_ranks, faithfully to SQL16, and that is the data
    // subject's own erasure rather than a coach action.
    for (const name of ['manage_coach_beta', 'attest_coach_claim_beta',
                        'respond_coach_attestation_beta', 'coach_owns_team_beta',
                        'is_team_creator_beta']) {
      const body = fnBody(sql, name)
      const code = body.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
      for (const forbidden of ['player_ranks', 'player_ratings', 'rating_events',
                               'match_player_performances', 'match_results']) {
        expect(code, `${name} must not reach ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('keeps the coach RPCs out of the PDPA erasure escape hatch', () => {
    // Only delete_my_athlete_data may set the flag the history guard yields to.
    for (const name of ['manage_coach_beta', 'attest_coach_claim_beta', 'respond_coach_attestation_beta']) {
      expect(fnBody(sql, name), `${name} must not set the erasure flag`).not.toContain('bds.pdpa_erasure')
    }
    expect(fnBody(sql, 'delete_my_athlete_data')).toContain('bds.pdpa_erasure')
  })

  it('refuses an unknown action rather than ignoring it', () => {
    expect(sql).toContain('INVALID_ACTION')
  })

  it('keeps the attestation metadata free of contact or identity detail', () => {
    const respond = fnBody(sql, 'respond_coach_attestation_beta')
    const metadata = respond.match(/jsonb_build_object\([\s\S]*?\)/)?.[0] ?? ''
    expect(metadata).toContain('team_id')
    expect(metadata).toContain('attestation_id')
    for (const leak of ['email', 'phone', 'contact', 'display_name', 'birth']) {
      expect(metadata, `${leak} must not be copied into provenance metadata`).not.toContain(leak)
    }
    // The recorded value must be the structured field, not prose.
    expect(metadata).toContain('a.claimed_value')
  })

  it('replaces the free-text claim with a structured field and value', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    // A coach states one named field, not prose a reviewer would have to interpret.
    expect(code).toMatch(/field text not null[\s\S]*?check\s*\(\s*field\s*=\s*'playing_position'\s*\)/)
    expect(code).not.toMatch(/claim text not null/)
  })

  it('validates the position against an explicit allowed set', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).toMatch(/claimed_value text not null[\s\S]*?check\s*\(\s*claimed_value in \('GK', 'DF', 'MF', 'FW'\)\s*\)/)
    // And again in the RPC, so a bad value never reaches the insert.
    expect(fnBody(sql, 'attest_coach_claim_beta')).toContain('INVALID_POSITION')
  })

  it('records field-level provenance naming exactly what was verified', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).toContain('create table public.coach_verified_fields')
    const respond = fnBody(sql, 'respond_coach_attestation_beta')
    expect(respond).toContain('insert into public.coach_verified_fields')
    expect(respond).toContain("'coach_attestation:playing_position'")
    const metadata = respond.match(/jsonb_build_object\([\s\S]*?\)/)?.[0] ?? ''
    expect(metadata).toContain("'field'")
    expect(metadata).toContain("'verified_value'")
  })

  it('never claims the whole profile, identity, rating or performance was verified', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    for (const overclaim of ['identity_document', 'performance_verified', 'admin_verified']) {
      expect(code, `${overclaim} must not appear`).not.toContain(overclaim)
    }
    // Confidence must stay modest: one self-reported field confirmed by one coach.
    expect(code).toMatch(/0\.[0-6]\d{3}/)
  })

  it('keeps field-level history rather than overwriting an earlier verification', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).not.toMatch(/update public\.coach_verified_fields/)
    expect(code).toMatch(/coach_verified_fields[\s\S]*?verified_at/)
  })

  it('authorises an attestation only by the actual team creator, never by an admin', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    // An admin roster capability is a different thing from being the coach. An admin
    // action must never be recorded as coach_verified.
    expect(code).toContain('create function public.is_team_creator_beta')
    const creator = fnBody(sql, 'is_team_creator_beta')
    expect(creator).toContain('t.created_by = auth.uid()')
    expect(creator).not.toContain('is_admin')
    expect(fnBody(sql, 'attest_coach_claim_beta')).toContain('public.is_team_creator_beta')
    expect(fnBody(sql, 'attest_coach_claim_beta')).not.toContain('coach_owns_team_beta')
  })

  it('gives the coach RPC no implicit admin override at all', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    // Roster removal is the team creator's own action. An admin override would be an
    // unaudited mutation, so it must be a separate, explicitly approved RPC on the
    // SQL35 audit trail rather than a branch hidden in here.
    expect(fnBody(sql, 'manage_coach_beta')).toContain('public.is_team_creator_beta')
    expect(fnBody(sql, 'manage_coach_beta')).not.toContain('is_admin')
    // The admin-capable helper is removed rather than left lying around.
    expect(code).not.toContain('coach_owns_team_beta')
  })

  it('never calls is_admin from any coach capability', () => {
    for (const name of ['manage_coach_beta', 'attest_coach_claim_beta',
                        'respond_coach_attestation_beta', 'is_team_creator_beta']) {
      const body = fnBody(sql, name)
      const code = body.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
      expect(code, `${name} must not consult is_admin`).not.toContain('is_admin')
    }
  })

  it('states that exactly one coach can attest for a team', () => {
    // Only teams.created_by may attest, so the live index needs no coach_id and the
    // comments must not suggest several coaches could compete for one team.
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).toContain('coach_attestations_live_idx')
    expect(sql).not.toMatch(/whichever coach|any coach|another coach on the same team/i)
  })

  it('rejects a replacement in the database, not only in the UI', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    // A direct RPC caller must hit the same wall the form does.
    const attest = fnBody(sql, 'attest_coach_claim_beta')
    expect(attest).toContain('ATTESTATION_ALREADY_PENDING')
    expect(attest).toContain('ATTESTATION_ALREADY_ACCEPTED')
    // And an index enforces it regardless of which coach submits.
    expect(code).toMatch(/create unique index coach_attestations_live_idx[\s\S]*?\(team_id, athlete_id, field\)[\s\S]*?where status in \('pending', 'accepted'\)/)
  })

  it('extends the PDPA deletion flow without editing an applied migration', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).toContain('create or replace function public.delete_my_athlete_data()')
    const fn = fnBody(sql, 'delete_my_athlete_data')
    // SQL36's hardening must be restated: CREATE OR REPLACE drops proconfig.
    expect(fn).toMatch(/set search_path = ''/)
    expect(fn).toContain('security definer')
    // SQL33/36 privileges must be reasserted after the replace.
    expect(code).toContain("revoke all on function public.delete_my_athlete_data() from public, anon, service_role")
    expect(code).toContain('grant execute on function public.delete_my_athlete_data() to authenticated')
  })

  it('refuses replacement unless prosrc matches an exact deterministic fingerprint', () => {
    const guard = sql.match(/do \$\$[\s\S]*?delete_my_athlete_data[\s\S]*?\$\$;/)?.[0] ?? ''
    // Marker substrings cannot detect an added line that still contains them, so the
    // guard compares a hash of the whole body plus its length.
    expect(guard).toContain('md5(')
    expect(guard).toContain('c417f309449e0ab60c41daab57f87d74')
    expect(guard).toMatch(/length\(\s*p?\.?prosrc\s*\)/)
    expect(guard).toContain('1369')
    expect(guard).toContain('raise exception')
  })

  it('tells the operator a mismatch is not permission to overwrite', () => {
    const guard = sql.match(/do \$\$[\s\S]*?delete_my_athlete_data[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(guard).toMatch(/manual reconciliation|reconcile by hand/i)
    expect(guard).toMatch(/not permission to overwrite/i)
  })

  it('has a precheck reporting the deletion function identity and fingerprint', () => {
    const pre = read('47-coach-beta-management-precheck.sql')
    expect(pre).toContain('delete_my_athlete_data')
    expect(pre).toMatch(/md5\(/)
    expect(pre).toMatch(/prosrc_fingerprint/)
    expect(pre).toMatch(/prosrc_length/)
    expect(pre).toContain('prosecdef')
    expect(pre).toContain('proconfig')
    // Owner and effective grants, so drift in privileges is visible too.
    expect(pre).toMatch(/function_owner/)
    expect(pre).toMatch(/has_function_privilege\('anon'/)
    expect(pre).toMatch(/has_function_privilege\('authenticated'/)
    expect(pre).toMatch(/has_function_privilege\('service_role'/)
    expect(pre).toContain('c417f309449e0ab60c41daab57f87d74')
  })

  it('erases only the requesting athlete\u2019s coach-attestation records', () => {
    const fn = fnBody(sql, 'delete_my_athlete_data')
    for (const table of ['public.coach_attestations', 'public.coach_verified_fields',
                         'public.data_provenance', 'public.verification_events']) {
      expect(fn, `${table} must be cleaned up`).toContain(`delete from ${table}`)
    }
    // Every delete must be keyed to the caller, never to a coach or another athlete.
    const deletes = [...fn.matchAll(/delete from public\.\w+[\s\S]*?;/g)].map(match => match[0])
    expect(deletes.length).toBeGreaterThanOrEqual(4)
    for (const statement of deletes) {
      expect(statement, `unscoped delete: ${statement.slice(0, 60)}`).toMatch(/v_user_id/)
    }
    // A coach's attestations about other athletes are those athletes' records.
    expect(fn).not.toMatch(/delete from public\.coach_attestations\s+where\s+coach_id/)
  })

  it('lets the append-only history guard yield only to the data subject\u2019s own erasure', () => {
    const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
    expect(code).toContain('create or replace function public.prevent_data_trust_history_mutation()')
    const guard = fnBody(sql, 'prevent_data_trust_history_mutation')
    expect(guard).toContain('security invoker')
    expect(guard).toMatch(/set search_path = ''/)
    expect(guard).toContain('DATA_TRUST_HISTORY_APPEND_ONLY')
    // Only a DELETE, only inside a flagged erasure transaction, only the caller's rows.
    expect(guard).toContain("tg_op = 'DELETE'")
    expect(guard).toContain('bds.pdpa_erasure')
    expect(guard).toContain('old.subject_id = auth.uid()')
  })

  it('has a postcheck that proves the PDPA extension landed intact', () => {
    const post = read('47-coach-beta-management-postcheck.sql')
    expect(post).toContain('delete_my_athlete_data')
    expect(post).toContain('prevent_data_trust_history_mutation')
    expect(post).toContain('verification_events_append_only')
    expect(post).toMatch(/retained only until/i)
    // The replaced function must still be definer with an empty search_path.
    expect(post).toContain('prosecdef')
  })

  it('documents that audit history is retained only until erasure is exercised', () => {
    expect(sql).toMatch(/retained only until/i)
    expect(sql).toMatch(/PDPA/)
  })

  it('cannot be used to attest about yourself', () => {
    expect(sql).toContain('CANNOT_ATTEST_SELF')
    expect(sql).toContain('check (coach_id <> athlete_id)')
  })
})
