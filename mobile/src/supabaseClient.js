// Mobile Supabase client. Metro substitutes this file for app/src/lib/supabase.js, so the
// shared data layer (db.js → supabaseDb.js) talks to the same project as the website.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = isConfigured
  ? createClient(url, key, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })
  : null;

// Refresh the session only while the app is in the foreground (Supabase's RN guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://praxio-chi.vercel.app';
