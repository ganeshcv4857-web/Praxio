import { useEffect, useMemo, useState } from 'react';
import { Pressable, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfigured, supabase } from './src/supabaseClient.js';
import { PALETTES, ThemeContext, useTheme } from './src/theme.js';
import { usePraxioData } from './src/data.js';
import { PREVIEW, PREVIEW_SESSION, usePreviewData } from './src/devPreview.js';
import { ErrorBoundary, Headline, Loading, Notice, Screen, T } from './src/ui.js';
import Login from './src/screens/Login.js';
import Today from './src/screens/Today.js';
import Tasks from './src/screens/Tasks.js';
import Career from './src/screens/Career.js';
import Profile from './src/screens/Profile.js';

// Praxio mobile: a companion to the website. Today, Tasks, Career and Profile only;
// the full product (assessment, feasibility, market, family, advisor) stays on the web.

const THEME_KEY = 'praxio-theme';
// Dev-only preview (web dev server + ?preview) swaps in sample data; phones always use real data.
const useData = PREVIEW ? usePreviewData : usePraxioData;
const TABS = [['today', 'Today'], ['tasks', 'Tasks'], ['career', 'Career'], ['profile', 'Profile']];

export default function App() {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState('system');
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, InstrumentSerif_400Regular_Italic });

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); }).catch(() => {});
  }, []);
  const setMode = (m) => { setModeState(m); AsyncStorage.setItem(THEME_KEY, m).catch(() => {}); };

  const dark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const theme = useMemo(() => ({
    c: dark ? PALETTES.dark : PALETTES.light, dark, mode, setMode, fontsReady: Boolean(fontsLoaded) && !fontError,
  }), [dark, mode, fontsLoaded, fontError]);

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StatusBar style={theme.c.statusBar} />
        <View style={{ flex: 1, backgroundColor: theme.c.bg }}>
          {/* Fonts are optional: render with system fonts if they're slow or fail. */}
          {fontsLoaded || fontError ? <Root /> : <Loading label="" />}
        </View>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    if (!supabase) return undefined;
    let live = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (live) setSession(data?.session ?? null); })
      .catch(() => { if (live) setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => { live = false; sub?.subscription?.unsubscribe(); };
  }, []);

  if (PREVIEW) return <Signedin session={PREVIEW_SESSION} />;
  if (!isConfigured) {
    return (
      <Screen>
        <Headline lead="Almost" accent="there." />
        <Notice tone="bad">Praxio isn’t connected. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env.local and restart.</Notice>
      </Screen>
    );
  }
  if (session === undefined) return <Loading label="" />;
  if (!session) return <ErrorBoundary><Login /></ErrorBoundary>;
  return <Signedin key={session.user.id} session={session} />;
}

function Signedin({ session }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('today');
  const { data, loading, error, reload } = useData(session.user.id);

  if (!data && loading) return <Loading label="Loading your position…" />;
  if (!data) {
    return (
      <Screen onRefresh={reload} refreshing={loading}>
        <Headline lead="Couldn’t" accent="connect." />
        <Notice tone="bad">{error ?? 'Praxio couldn’t load your data.'} Pull down to retry.</Notice>
      </Screen>
    );
  }

  const props = { data, loading, reload, userId: session.user.id, profile: data.profile };
  return (
    <View style={{ flex: 1 }}>
      <ErrorBoundary key={tab} onRetry={reload}>
        {tab === 'today' && <Today {...props} goTasks={() => setTab('tasks')} />}
        {tab === 'tasks' && <Tasks {...props} />}
        {tab === 'career' && <Career {...props} />}
        {tab === 'profile' && <Profile profile={data.profile} email={session.user.email} />}
      </ErrorBoundary>

      <View
        accessibilityRole="tablist"
        style={{
          position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, flexDirection: 'row', padding: 6, borderRadius: 999,
          backgroundColor: t.c.surface, shadowColor: t.c.shadow, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6,
        }}
      >
        {TABS.map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(id)}
              style={{ flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent : 'transparent' }}>
              <T kind={on ? 'medium' : 'regular'} size={14} color={on ? t.c.onAccent : t.c.text2}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
