import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { robotsHeader } from '@/lib/seo'

const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/profile', '/organizer-request']

// Next prefetches the links on screen. A prefetch of a public page needs no session check
// here: the page checks the user itself when it renders, and the real visit refreshes the
// session. Skipping it saves a Supabase Auth round trip per link (22 Oct 2026).
function isPrefetch(request: NextRequest) {
  return request.headers.get('next-router-prefetch') === '1'
    || request.headers.get('purpose') === 'prefetch'
    || (request.headers.get('sec-purpose') ?? '').includes('prefetch')
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const pathname = request.nextUrl.pathname
  const isProtectedRoute = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))
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
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|photos/|.*\\.(?:webp|png|jpe?g|gif|svg|ico|avif|woff2?|ttf|map)$).*)'],
}
