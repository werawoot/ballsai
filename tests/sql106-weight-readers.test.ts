import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'

// SQL106 took SELECT on athlete_profiles.weight_kg from anon and authenticated. A SECURITY INVOKER
// function runs as its caller, so one that reads the column fails for everyone: my_profile_home
// (SQL91) did, and /profile broke on Staging until SQL107 (code review, 26 Nov 2026). The latest
// definition of every function in sql/ that runs as its caller must read the weight only through
// athlete_weight_kg.
const numbered = readdirSync('sql')
  .filter(file => /^\d+-.*\.sql$/.test(file) && !/-(down|down-production|precheck|postcheck)\.sql$/.test(file))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b))

const latest = new Map<string, { file: string; body: string }>()
for (const file of numbered) {
  const source = readFileSync(`sql/${file}`, 'utf8')
  for (const match of source.matchAll(/create or replace function (public\.\w+)\(([\s\S]*?)\n\$\$;/gi)) {
    latest.set(match[1], { file, body: match[0] })
  }
}

describe('functions that run as their caller do not read the private weight column', () => {
  it('finds the functions it guards, my_profile_home among them', () => {
    expect(latest.get('public.my_profile_home')?.file).toBe('107-my-profile-home-weight-v1.sql')
  })

  it('has no invoker function reading weight_kg from a table', () => {
    const offenders = [...latest.entries()]
      .filter(([, { body }]) => !/security definer/i.test(body))
      .filter(([, { body }]) => /\b\w+\.weight_kg\b/.test(body.replace(/--[^\n]*/g, '')))
      .map(([name, { file }]) => `${name} (${file})`)
    expect(offenders).toEqual([])
  })
})
