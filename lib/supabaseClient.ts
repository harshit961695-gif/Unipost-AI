"use client";

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

console.log("Supabase env loaded:", { hasUrl: !!supabaseUrl, hasKey: !!supabaseAnonKey });

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: (url, options) => {
            return fetch(url, { ...options, cache: 'no-store' });
        }
    }
});