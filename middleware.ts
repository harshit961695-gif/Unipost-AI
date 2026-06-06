import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Explicit development bypass
  if (process.env.BYPASS_AUTH_FOR_TESTING === 'true') {
    return response;
  }

  // Define public routes that bypass auth check
  const isPublicRoute = 
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/api/connect/') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/fetch-analytics' ||
    pathname === '/api/schedule/check' ||
    pathname === '/api/analytics/test';

  // Protect /dashboard/* and /api/*
  const shouldProtect = pathname.startsWith('/dashboard') || pathname.startsWith('/api');

  if (!shouldProtect || isPublicRoute) {
    return response;
  }

  // Initialize Supabase Client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name: '',
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // If it's an API route, return 401 Unauthorized
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    // Else, redirect to /login page
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, svg, png etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
