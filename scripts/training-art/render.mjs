// Renders public/training/drills/<drill>.webp from poses.mjs. Run after changing a pose:
//
//   node scripts/training-art/render.mjs            # every drill
//   node scripts/training-art/render.mjs a1-react-jog,c4-plank
//
// Needs Playwright with Chromium (software WebGL is enough) and the `three` dev dependency.
// The images are committed; the app never loads three.js.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENES } from './poses.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const out = join(root, 'public/training/drills')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' }
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!path.startsWith(root) || !existsSync(path)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
  res.end(readFileSync(path))
}).listen(0)
const port = server.address().port

let chromium
try { ({ chromium } = await import('playwright')) } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')) }
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SCENES)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
page.on('pageerror', error => { console.error(error.message); process.exitCode = 1 })
await page.goto(`http://localhost:${port}/scripts/training-art/page.html`)
await page.waitForFunction(() => window.ready)
for (const name of only) {
  if (!SCENES[name]) throw new Error(`No scene called ${name}`)
  await page.evaluate(spec => window.draw(spec), { w: 800, h: 600, ...SCENES[name] })
  const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/webp', 0.82))
  writeFileSync(join(out, `${name}.webp`), Buffer.from(data.split(',')[1], 'base64'))
  console.log(`rendered ${name}.webp`)
}
await browser.close()
server.close()
