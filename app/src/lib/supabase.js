import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

// Sessions persist in localStorage via supabase-js; everything else lives in Postgres.
export const supabase = isConfigured ? createClient(url, key) : null;
