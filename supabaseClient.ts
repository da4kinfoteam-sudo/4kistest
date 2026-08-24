// Author: 4K 
import { createClient } from '@supabase/supabase-js';

// Get credentials from Vite environment
const SB_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '';

// Supabase Auth owns the signed, expiring application session. Authorization is
// resolved from the linked public profile and centralized policy tables.
export const supabase = (SB_URL && SB_KEY) 
    ? createClient(SB_URL, SB_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    })
    : null;

// Diagnostics
if (supabase && typeof window !== 'undefined') {
    (window as any).dbStatus = async () => {
        const { error, data } = await supabase.auth.getSession();
        return error ? { status: 'failed', error } : { status: 'success', data };
    };
}
// --- End of supabaseClient.ts ---
