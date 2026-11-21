import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { robotsHeader } from '@/lib/seo'

const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/profile', '/me', '/progress', '/organizer-request']

// A browser's own prefetch (Purpose / Sec-Purpose: a <link rel=prefetch> or speculation rule) of a
// public page needs no session check here: the page checks the user itself when it renders, and
// the real visit refreshes the session (22 Oct 2026). Next's own <Link> prefetches never reach
// this function: config.matcher below leaves them out (T62).
function isPrefetch(request: NextRequest) {
  return request.headers.get('purpose') === 'prefetch'
    || (request.headers.get('sec-purpose') ?? '').includes('prefetch')
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const pathname = request.nextUrl.pathname
  // Segment-aware, so /me never claims a future /media or /members.
  const isProtectedRoute = PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (!isProtectedRoute && isPrefetch(request)) return withRobots(supabaseResponse, pathname)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // `headers` forbid caching (Cache-Control private/no-store, Expires, Pragma): a
        // response that carries one person's session must never be served to another.
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && isProtectedRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return withRobots(NextResponse.redirect(loginUrl), pathname)
  }

  return withRobots(supabaseResponse, pathname)
}

// Signed-in areas and pages naming young athletes are never indexed (lib/seo.ts).
function withRobots(response: NextResponse, pathname: string) {
  const value = robotsHeader(pathname)
  if (value) response.headers.set('X-Robots-Tag', value)
  return response
}

// Not for built assets, photos or other static files: each run asks Supabase Auth who the
// user is, and an image needs no answer.
// Nor for a <Link> prefetch (T62, owner 21 Nov 2026: "ใช้ matcher แทน"). Next removes its router
// headers, next-router-prefetch among them, before this function sees the request
// (next/dist/server/web/adapter.js, FLIGHT_HEADERS), so the check has to sit here, where the router
// matches the raw request. A prefetch of a page with no loading.tsx above it renders only the root
// layout, which asks nothing of Supabase, yet it cost one Auth call here, 4 to 11 per page view
// (scripts/e2e/request-count.mjs, 21 Nov 2026). A prefetch of a protected page is not redirected
// here; the real visit runs this function and redirects.
// /admin is the exception: its loading.tsx makes a prefetch render app/admin/layout.tsx, which asks
// Supabase who the user is. With an expired token that call would refresh the session where no
// cookie can be written, so admin prefetches still come through here first, which refreshes it.
// tests/middleware-auth-cookies.test.ts holds both rules and fails if a loading.tsx appears elsewhere.
export const config = {
  matcher: [{ source: '/admin/:path*' }, {
    source: '/((?!_next/static|_next/image|favicon.ico|photos/|.*\\.(?:webp|png|jpe?g|gif|svg|ico|avif|woff2?|ttf|map)$).*)',
    missing: [{ type: 'header', key: 'next-router-prefetch' }],
  }],
}
