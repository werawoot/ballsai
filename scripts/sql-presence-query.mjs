// Prints one read-only SQL query that lists every table, view, function and index the files in
// sql/ create but the database does not have (owner, 15 Nov 2026: the runbook had drifted from
// Production and Staging). Paste the output into the SQL Editor of one project, or run it through
// the Supabase connector, and compare the result with the runbook. Rollback, check, sample and
// bundle files are skipped. It reads object names only, never rows.
//
//   node scripts/sql-presence-query.mjs > /tmp/presence.sql
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../sql/', import.meta.url)
const skip = /(down|rollback|precheck|postcheck|sample|private-slips|apply-closed-beta|drop-beta)/
const patterns = [
  ['t', /create table (?:if not exists )?(?:public\.)?"?([a-z_0-9]+)/g],
  ['f', /create (?:or replace )?function (?:public\.)?([a-z_0-9]+)\s*\(/g],
  ['i', /create (?:unique )?index (?:concurrently )?(?:if not exists )?([a-z_0-9]+)/g],
  ['v', /create (?:or replace )?view (?:public\.)?([a-z_0-9]+)/g],
]

const objects = new Map()
for (const name of readdirSync(dir).filter(file => file.endsWith('.sql') && !skip.test(file)).sort()) {
  const text = readFileSync(new URL(name, dir), 'utf8').toLowerCase().replace(/--[^\n]*/g, '')
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) if (!objects.has(`${kind}:${match[1]}`)) objects.set(`${kind}:${match[1]}`, name)
  }
}

const list = [...objects.keys()].map(key => `'${key}'`).join(',')
console.log(`-- ${objects.size} objects from sql/; returns the missing ones. Read-only.
select string_agg(obj, ' ' order by obj) as missing, count(1) as missing_count from (select o as obj, case split_part(o,':',1)
 when 't' then to_regclass('public.'||split_part(o,':',2)) is not null
 when 'v' then to_regclass('public.'||split_part(o,':',2)) is not null
 when 'i' then exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname=split_part(o,':',2) and c.relkind in ('i','I'))
 when 'f' then exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=split_part(o,':',2)) end as present
from unnest(array[${list}]) o) x where not present;`)
