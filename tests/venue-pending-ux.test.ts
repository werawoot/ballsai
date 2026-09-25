import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const BOOKING = 'app/venues/BookingRequestClient.tsx'
const MODERATION = 'app/admin/venue-photos/VenuePhotoModerationList.tsx'
const MANAGER = 'app/venue/VenuePhotoManager.tsx'

// Every button in these three flows fires an async request that ends in a refresh, so a
// second press races the first. Each file must show pending state and refuse re-entry.
const FLOWS = [
  { name: 'booking request', file: BOOKING },
  { name: 'admin photo moderation', file: MODERATION },
  { name: 'owner photo manager', file: MANAGER },
]

describe.each(FLOWS)('$name pending feedback', ({ file }) => {
  const source = () => read(file)

  it('marks the running control with aria-busy', () => {
    expect(source()).toContain('aria-busy')
  })

  it('drives its buttons through the shared pending helper', () => {
    expect(source()).toContain('pendingButton')
    expect(source()).toContain('VENUE_PENDING_COPY')
  })

  it('refuses re-entry inside the handler, not only through disabled', () => {
    expect(source()).toContain('shouldStartAction')
  })

  it('clears the pending key on both the success and the failure path', () => {
    // Whatever the state setter is called, it must be reset to null somewhere.
    expect(source()).toMatch(/set\w*[Pp]ending\(null\)|setBusy\w*\(null\)/)
  })

  it('has no leftover reference to the old ad-hoc busy flag', () => {
    // The rename from `busy`/`busyId` to a single pending key left one `cursor: busy ?`
    // behind in a style helper. Vitest does not typecheck, so only `npm run build`
    // caught it; this keeps a rename from silently half-landing again.
    const code = source()
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join('\n')
    // Reads of a bare `busy` / `busyId` value only. The `busy:` key of
    // VENUE_PENDING_COPY and any `.busy` property read are the new API, not the old flag.
    const reads = [...code.matchAll(/(?<![\w.'"-])(busy|busyId)(?![\w'"-]|\s*:)/g)]
    expect(reads.map(match => match[0])).toEqual([])
  })

  it('announces progress and outcome in a live region', () => {
    expect(source()).toContain('aria-live')
    expect(source()).toContain('role="status"')
  })

  it('adds no new dependency to show a pending state', () => {
    // Matches the module specifier itself, so a multi-line import is checked too.
    const specifiers = [...source().matchAll(/from '([^']+)'/g)].map(match => match[1])

    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(specifier, `${specifier} is not an existing React/Next/local module`)
        .toMatch(/^(react|next\/[\w-]+|lucide-react|@\/[\w/-]+)$/)
    }
  })
})

describe('booking request button', () => {
  it('says it is sending the request while it is in flight', () => {
    expect(read(BOOKING)).toContain('VENUE_PENDING_COPY.booking')
  })

  it('stops showing a pointer cursor once the button is locked', () => {
    // A disabled button that still shows a pointer reads as clickable.
    const source = read(BOOKING)
    expect(source).toMatch(/cursor: \w+\.disabled \? 'not-allowed' : 'pointer'|cursor: \w+ \? 'not-allowed' : 'pointer'/)
  })
})

describe('admin moderation button', () => {
  it('distinguishes approving from hiding while pending', () => {
    const source = read(MODERATION)
    expect(source).toContain('VENUE_PENDING_COPY.approve')
    expect(source).toContain('VENUE_PENDING_COPY.hide')
  })

  it('no longer relies on an unlabelled spinner as the only pending cue', () => {
    const source = read(MODERATION)
    // The label itself has to change, so the cue is not icon-only.
    expect(source).toContain('.label')
  })
})

describe('owner photo manager buttons', () => {
  it('shows pending copy for upload, delete and cover', () => {
    const source = read(MANAGER)
    expect(source).toContain('VENUE_PENDING_COPY.upload')
    expect(source).toContain('VENUE_PENDING_COPY.remove')
    expect(source).toContain('VENUE_PENDING_COPY.cover')
  })

  it('keeps the icon-only reorder buttons announceable while they work', () => {
    const source = read(MANAGER)
    expect(source).toContain('VENUE_PENDING_COPY.move')
    // Their accessible name is the aria-label, so it must swap to the pending copy
    // rather than staying "เลื่อนรูปขึ้น" while the reorder is in flight.
    const swaps = [...source.matchAll(/aria-label=\{(\w+)\.isPending \? \1\.label :/g)]
    expect(swaps.length, 'both reorder buttons must swap their accessible name').toBeGreaterThanOrEqual(2)
  })
})
