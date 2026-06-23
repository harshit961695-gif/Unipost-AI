/**
 * Server-side Supabase client
 * Used for API routes and server components
 * This ensures proper authentication context on the server
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

// Low-level client with no auth context
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

/**
 * Creates a Supabase client that uses cookies for authentication.
 * This should be used in API routes and Server Components.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Ignore if called from SC
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Ignore if called from SC
          }
        },
      },
    }
  )
}

/**
 * Legacy helper for direct access token usage.
 */
export const createAuthenticatedClient = (accessToken: string) => {
  const tokenLength = accessToken ? accessToken.length : 0;
  console.log(`[SUPABASE CLIENT] createAuthenticatedClient: token length = ${tokenLength}`);

  if (process.env.BYPASS_AUTH_FOR_TESTING === 'true') {
    console.log('[SUPABASE CLIENT] Bypass enabled - using service role client for createAuthenticatedClient');
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }

  // Validate that the token exists and is structurally a valid JWT (3 dot-separated parts)
  if (!accessToken || accessToken === 'undefined' || accessToken === 'null' || accessToken.split('.').length !== 3) {
    console.warn(`[SUPABASE CLIENT] Warning: Received malformed/missing accessToken (length: ${tokenLength}). Falling back to anon client.`);
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
