// QA: house-rule checks for /impact and the public fixtures page, against the local mock
// (scripts/qa/fixtures-mock.mjs) or a Staging Preview. Exits 1 if any check fails.
//
//   node scripts/qa/fixtures-impact-check.mjs                 # http://localhost:3071
//   QA_BASE_URL=https://<preview>.vercel.app QA_TOURNAMENT=<id> node scripts/qa/fixtures-impact-check.mjs
//
// Uses the Playwright installed in the cloud image; never run `playwright install`.
const { chromium } = await import(process.env.QA_PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs')

const base = process.env.QA_BASE_URL ?? 'http://localhost:3071'
const tournament = process.env.QA_TOURNAMENT ?? 't-groups'
const fixtures = `/tournaments/${tournament}/fixtures`
const viewports = [{ name: '320', width: 320, height: 640 }, { name: '390', width: 390, height: 844 }, { name: '1366', width: 1366, height: 900 }]
const failures = []
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures.push(label) }

const browser = await chromium.launch()
for (const locale of ['th', 'en']) {
  for (const viewport of viewports) {
    const mobile = viewport.width < 800
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
    const page = await context.newPage()
    for (const path of ['/impact', fixtures, `${fixtures}?view=tables`, `${fixtures}?view=bracket`]) {
      await page.goto(base + path, { waitUntil: 'networkidle' })
      const result = await page.evaluate(() => {
        const visible = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden' }
        const small = [...document.querySelectorAll('main a, main button, main summary')].filter(visible)
          .map(element => ({ text: element.textContent.trim().slice(0, 24), box: element.getBoundingClientRect() }))
          .filter(item => item.box.width < 44 || item.box.height < 44)
          .map(item => `"${item.text}" ${Math.round(item.box.width)}x${Math.round(item.box.height)}`)
        return { scrollWidth: document.documentElement.scrollWidth, small }
      })
      const where = `${locale} ${viewport.name}px ${path}`
      check(result.scrollWidth <= viewport.width, `${where}: no horizontal page scroll (page is ${result.scrollWidth}px)`)
      check(result.small.length === 0, `${where}: tap targets >= 44px${result.small.length ? ` (${result.small.slice(0, 4).join(', ')})` : ''}`)
    }
    await context.close()
  }
}

// A group filter is a plain link: every tap must open that group, not only some of them.
const tries = 6
let opened = 0
for (let attempt = 0; attempt < tries; attempt += 1) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await page.goto(base + fixtures, { waitUntil: 'networkidle' })
  const filter = page.locator('.fx-filter').nth(2)
  const target = await filter.getAttribute('href')
  await filter.click()
  await page.waitForTimeout(2500)
  if (page.url().endsWith(target)) opened += 1
  await page.close()
}
check(opened === tries, `group filter opens its group on every click (${opened}/${tries})`)

await browser.close()
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
