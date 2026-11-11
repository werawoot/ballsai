const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

const missing = required.filter(name => !process.env[name]?.trim())
const demoEnabled = process.env.NEXT_PUBLIC_SHOW_DEMO_DATA === 'true'
// The self-tests stay off in production until a licensed coach or physiotherapist signs off the
// protocols (ADR-015, owner 11 Nov 2026). Lift this line in the PR that records the sign-off.
const selfTestsEnabled = process.env.NEXT_PUBLIC_SELF_TESTS === 'true'
const messages = []

if (missing.length > 0) messages.push(`Missing required production variables: ${missing.join(', ')}`)
if (demoEnabled) messages.push('NEXT_PUBLIC_SHOW_DEMO_DATA must be false in closed beta and production.')
if (selfTestsEnabled) messages.push('NEXT_PUBLIC_SELF_TESTS must stay off in production until the coach sign-off (ADR-015).')

if (messages.length > 0) {
  console.error('Production configuration is not ready:')
  for (const message of messages) console.error(`- ${message}`)
  process.exit(1)
}

console.log('Production configuration check passed.')
console.log('- Supabase credentials configured')
console.log('- Demo fallback disabled')
console.log('- Self-tests hidden until the coach sign-off')
console.log('- Resend sender configured')
console.log('- Upstash distributed rate limits configured')
