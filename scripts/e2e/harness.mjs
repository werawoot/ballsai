// The shared harness of the browser end-to-end checks (scripts/e2e/*-flow.mjs, docs/e2e.md): the
// in-memory Supabase stand-in, browsers signed in as its users, steps that report PASS / FAIL with
// a screenshot and the step's request trace, clicks that wait for hydration, an axe-core audit,
// and the summary that sets the exit code.
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createState, startMock } from './mock-supabase.mjs'

export async function createHarness() {
  const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
  const OUT = process.env.E2E_OUT || new URL('../../.e2e-out/', import.meta.url).pathname
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const require = createRequire(import.meta.url)
  const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
  mkdirSync(OUT, { recursive: true })

  const state = createState()
  const mock = await startMock(state)
  const browser = await chromium.launch()
  const pageErrors = []
  const results = []
  const a11y = []
  let contrastUnmeasured = 0
  // Full page loads the test did not ask for: a navigation fallback in the app loaded the page
  // (lib/use-fresh-navigation.ts, GoalPicker). Each step reports how many, so a run says how often
  // a fallback fired, not only that it passed.
  let documentLoads = 0
  let expectedLoads = 0

  const h = {
    BASE, state, pageErrors,
    main: null, // the tab a step uses by default
    current: null, // the tab a failure screenshots

    watch(tab) {
      tab.on('pageerror', error => pageErrors.push(`${new URL(tab.url()).pathname}: ${error.message.slice(0, 160)}`))
      // A server redirect's later hops are the same load, not a new one.
      tab.on('request', request => { if (request.resourceType() === 'document' && request.frame() === tab.mainFrame() && !request.redirectedFrom()) documentLoads += 1 })
      tab.on('dialog', dialog => dialog.accept())
      // Page data the browser asks the app for (React Server Component requests), for the failure report.
      tab.on('request', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', request.headers()['next-router-prefetch'] ? 'prefetch' : 'rsc', new URL(request.url()).pathname]) })
      tab.on('requestfinished', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', 'done', new URL(request.url()).pathname]) })
      tab.on('requestfailed', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', 'aborted', new URL(request.url()).pathname]) })
      tab.on('response', response => { if (response.request().headers().rsc) state.trace.push([Date.now(), 'browser', 'headers', new URL(response.url()).pathname]) })
      return tab
    },

    // A browser signed in as one of the mock's users: the @supabase/ssr session cookie, unsigned.
    async signedIn(userId) {
      const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url')
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, exp: expiresAt, role: 'authenticated', aud: 'authenticated' })}.e2e`
      const session = { access_token: accessToken, refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: state.users[userId] }
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' })
      await context.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
      const tab = h.watch(await context.newPage())
      if (!h.main) { h.main = tab; h.current = tab }
      return tab
    },

    focus(tab) { h.current = tab },
    expectLoad() { expectedLoads += 1 },

    async step(name, run) {
      const startedAt = Date.now()
      const loadsBefore = documentLoads - expectedLoads
      try {
        await run()
        results.push({ name, ok: true })
        console.log(`PASS ${name}`)
        const fired = documentLoads - expectedLoads - loadsBefore
        if (fired > 0) console.log(`NOTE ${name}: a navigation fallback loaded the page in full (${fired})`)
      } catch (error) {
        results.push({ name, ok: false })
        const shot = `${OUT}${results.length}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`
        await h.current?.screenshot({ path: shot, fullPage: true }).catch(() => {})
        console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}\n     screenshot: ${shot}`)
        // What happened during the step, in order, so a failure can be told apart from a slow page.
        for (const [at, source, kind, path] of state.trace.filter(entry => entry[0] >= startedAt).slice(-60)) console.log(`     ${String(at - startedAt).padStart(6)}ms ${source.padEnd(7)} ${kind.padEnd(8)} ${path}`)
      }
    },

    expect(ok, message) { if (!ok) throw new Error(message) },
    async go(path, tab = h.main) { h.current = tab; expectedLoads += 1; await tab.goto(BASE + path, { waitUntil: 'networkidle' }) },
    visible(text, tab = h.main) { return tab.getByText(text).first().waitFor({ timeout: 10000 }) },
    async mainText(tab = h.main) { return (await tab.locator('main').innerText()).replace(/\s+/g, ' ') },

    // Click only once React has attached its handlers to the element. A tap before that does nothing
    // (an open finding, docs/e2e.md); the test waits for hydration rather than clicking twice, so a
    // click that still does nothing fails.
    async tap(locator) {
      await locator.waitFor({ timeout: 10000 })
      await locator.evaluate(element => new Promise((resolve, reject) => {
        const started = Date.now()
        const check = () => Object.keys(element).some(key => key.startsWith('__reactProps')) ? resolve() : Date.now() - started > 10000 ? reject(new Error('never hydrated')) : setTimeout(check, 50)
        check()
      }))
      await locator.click()
    },

    async audit(label, tab = h.main) {
      // Judge the settled page, not a frame of a fade: after a client-side move between a glass page
      // and a Matchday page the bottom bar's colours ease over .18s (globals.css), and a frame caught
      // mid-way reads as low contrast (measured: it settles by itself). Endless animations are left
      // out of the wait, and the wait is capped at 2 seconds.
      await tab.waitForTimeout(400)
      await tab.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter(item => item.effect?.getComputedTiming().endTime !== Infinity).map(item => item.finished.catch(() => {}))),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]))
      await tab.addScriptTag({ content: AXE })
      const found = await tab.evaluate(async () => {
        const report = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
        return {
          violations: report.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length, target: item.nodes[0]?.target?.join(' '), detail: item.nodes[0]?.any?.[0]?.message ?? '' })),
          // Text over a photo or a gradient: axe cannot measure it and lists it as "incomplete".
          unmeasured: report.incomplete.filter(item => item.id === 'color-contrast').reduce((sum, item) => sum + item.nodes.length, 0),
        }
      })
      contrastUnmeasured += found.unmeasured
      for (const item of found.violations) a11y.push({ page: label, ...item })
    },

    // The closing checks every flow ends with, the accessibility summary, and the exit code.
    async finish() {
      await h.step('no script error in the browser', async () => {
        h.expect(pageErrors.length === 0, pageErrors.join(' | '))
      })
      await h.step('the app asked the mock for nothing it does not know', async () => {
        h.expect(state.unknown.length === 0, [...new Set(state.unknown)].join(' | '))
      })
      const serious = a11y.filter(item => item.impact === 'serious' || item.impact === 'critical')
      console.log(`\naccessibility (axe-core, WCAG 2.1 A/AA): ${a11y.length} finding(s), ${serious.length} serious or critical; ${contrastUnmeasured} text element(s) over a photo or gradient that axe could not measure`)
      for (const item of a11y) console.log(`  ${item.impact.padEnd(8)} ${item.id} ×${item.nodes} on ${item.page}: ${item.help} [${item.target}]${item.detail ? `\n           ${item.detail}` : ''}`)
      results.push({ name: 'no serious or critical accessibility finding', ok: serious.length === 0 })
      await browser.close()
      mock.close()
      const failed = results.filter(item => !item.ok)
      console.log(`\n${results.length - failed.length}/${results.length} passed`)
      process.exit(failed.length ? 1 : 0)
    },
  }
  return h
}
