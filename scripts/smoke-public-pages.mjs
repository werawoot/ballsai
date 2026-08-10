/**
 * Read-only public-page smoke test.
 *
 * Run against local development by default, or set BASE_URL to a preview or
 * production deployment URL. No authentication and no database writes occur.
 */

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const checks = [
  { path: '/', status: 200, text: 'BallDoenSai.com' },
  { path: '/athletes', status: 200, text: 'นักกีฬา' },
  { path: '/ranking', status: 200, text: 'Ranking' },
  { path: '/tournaments', status: 200, text: 'รายการแข่ง' },
  { path: '/privacy', status: 200, text: 'Privacy' },
  { path: '/terms', status: 200, text: 'Terms' },
  { path: '/not-a-real-page', status: 404, text: 'BALLDOENSAI.COM' },
]

let failed = false

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, { redirect: 'manual' })
    const body = await response.text()
    const passed = response.status === check.status && body.includes(check.text)
    console.log(`${passed ? 'PASS' : 'FAIL'} ${check.path}: HTTP ${response.status}`)
    if (!passed) {
      console.log(`  expected HTTP ${check.status} and text: ${check.text}`)
      failed = true
    }
  } catch (error) {
    console.log(`FAIL ${check.path}: ${error instanceof Error ? error.message : String(error)}`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log(`Public smoke test passed for ${baseUrl}`)
