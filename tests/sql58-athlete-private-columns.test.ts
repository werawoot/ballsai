import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('58-athlete-private-columns-v1.sql')
const migration = raw.replace(/\s+/g, ' ')
const between = (start: string, end = ';') => {
  const from = migration.indexOf(start)
  expect(from).toBeGreaterThanOrEqual(0)
  return migration.slice(from, migration.indexOf(end, from + start.length))
}

// T50: RLS picks rows, not columns. A public profile's birth date and guardian consent
// time were readable by anyone. SQL58 withholds those two columns from every caller but
// the athlete, and gives the pages an age instead. Its behaviour was run on Postgres 16
// with Supabase-like roles (anon, authenticated) before this file was committed; these
// checks keep the file from drifting.
describe('SQL58 athlete private columns', () => {
  it('runs after SQL52 and SQL50, and checks it', () => {
    expect(migration).toContain("raise exception 'SQL58 needs SQL52 applied first'")
    expect(migration).toContain("raise exception 'SQL58 needs SQL50 applied first'")
  })

  it('takes table-wide SELECT away and gives back every column but the two private ones', () => {
    expect(migration).toContain("column_name not in ('birth_date', 'guardian_consent_at')")
    expect(migration).toContain("revoke select on public.athlete_profiles from public, anon, authenticated")
    expect(migration).toContain("revoke select (birth_date, guardian_consent_at) on public.athlete_profiles from public, anon, authenticated")
    expect(migration).toMatch(/grant select \(%s\) on public\.athlete_profiles to anon, authenticated/)
    expect(migration).not.toMatch(/revoke (insert|update)/i)
  })

  it('works out ages in the database, for public profiles, the owner, or an admin only', () => {
    const age = between('create function public.public_athlete_age(p_user_id uuid)', '$$;')
    expect(age).toContain("security definer set search_path = ''")
    expect(age).toContain("(now() at time zone 'Asia/Bangkok')::date")
    expect(age).toContain('(a.is_public or a.user_id = (select auth.uid()) or (select public.is_admin()))')
    expect(age).not.toMatch(/select a\.birth_date|returns date/)
  })

  it('hands the birth date and consent time back to the athlete alone, never to a signed-out caller', () => {
    const own = between('create function public.my_athlete_private()', '$$;')
    expect(own).toContain("security definer set search_path = ''")
    expect(own).toContain('where a.user_id = (select auth.uid())')
    expect(migration).toContain('revoke all on function public.my_athlete_private() from public, anon, authenticated;')
    expect(migration).toContain('grant execute on function public.my_athlete_private() to authenticated, service_role;')
    expect(migration).not.toMatch(/grant execute on function public\.my_athlete_private\(\) to anon/)
  })

  it('keeps both views running as the caller, public profiles only, with no birth date', () => {
    const rankings = between('create or replace view public.public_athlete_rankings')
    const directory = between('create view public.public_athlete_directory')
    for (const view of [rankings, directory]) {
      expect(view).toContain('with (security_invoker = true)')
      expect(view).not.toMatch(/birth_date|guardian_consent_at|\ba\.\*|\br\.\*|\bbio\b|height_cm|weight_kg/)
    }
    expect(rankings).toContain('coalesce(public.public_athlete_age(a.user_id) < 18, false) as under_18')
    expect(rankings).toContain('and a.is_public')
    expect(directory).toContain('where a.is_public')
    expect(migration).toContain('grant select on public.public_athlete_directory to anon, authenticated, service_role;')
  })

  it('recreates the rankings view with SQL52\'s columns in SQL52\'s order', () => {
    // Split the select list at top-level commas only: coalesce(x, 0) is one column.
    const columns = (sql: string) => {
      const list = sql.slice(sql.indexOf(' as select ') + 11, sql.indexOf(' from public.player_ranks'))
      const items: string[] = []
      let depth = 0
      let current = ''
      for (const char of list) {
        if (char === ',' && depth === 0) { items.push(current); current = ''; continue }
        if (char === '(') depth += 1
        if (char === ')') depth -= 1
        current += char
      }
      items.push(current)
      return items.map(item => item.trim().split(' as ').pop()!.replace(/^r\./, ''))
    }
    const sql52 = code('52-public-athlete-rankings-view-v1.sql').replace(/\s+/g, ' ')
    const view52 = sql52.slice(sql52.indexOf('create or replace view'), sql52.indexOf(';', sql52.indexOf('create or replace view')))
    expect(columns(between('create or replace view public.public_athlete_rankings'))).toEqual(columns(view52))
  })

  it('indexes the ดาวรุ่ง tab order so the age check stops after one page', () => {
    expect(migration).toContain('create index if not exists player_ranks_emerging_idx on public.player_ranks (sport, season, rank_change desc, pts desc, id);')
  })

  it('checks itself, signed out included, and rolls back on any mismatch', () => {
    expect(raw).toMatch(/^begin;/m)
    expect(raw).toMatch(/^commit;\s*$/m)
    expect(migration).toContain("raise exception 'SQL58 left % able to read birth_date or guardian_consent_at', v_role")
    expect(migration).toContain("raise exception 'SQL58 took % read access to: %', v_role, v_bad")
    expect(migration).toContain('set local role anon;')
    expect(migration).toContain("raise exception 'SQL58 anon can still read birth_date'")
    expect(migration).toContain('exception when insufficient_privilege then null;')
  })

  it.each(['58-athlete-private-columns-precheck.sql', '58-athlete-private-columns-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
