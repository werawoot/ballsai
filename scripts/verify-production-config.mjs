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
const messages = []

if (missing.length > 0) messages.push(`Missing required production variables: ${missing.join(', ')}`)
if (demoEnabled) messages.push('NEXT_PUBLIC_SHOW_DEMO_DATA must be false in closed beta and production.')

if (messages.length > 0) {
  console.error('Production configuration is not ready:')
  for (const message of messages) console.error(`- ${message}`)
  process.exit(1)
}

console.log('Production configuration check passed.')
console.log('- Supabase credentials configured')
console.log('- Demo fallback disabled')
console.log('- Resend sender configured')
console.log('- Upstash distributed rate limits configured')
