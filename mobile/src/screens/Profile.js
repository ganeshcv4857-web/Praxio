import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import { userContext } from '../../../app/src/lib/userContext.js';
import { supabase, WEB_URL } from '../supabaseClient.js';
import { clearCache } from '../data.js';
import { REMINDER_TIMES, disableReminder, enableReminder, readReminder, reminderText, remindersSupported } from '../reminders.js';
import { haptic } from '../haptics.js';
import { useTheme } from '../theme.js';
import { Button, Card, Headline, Label, Screen, T } from '../ui.js';

const MODES = [['system', 'Phone'], ['light', 'Light'], ['dark', 'Dark']];

// Sign out also clears this phone's cached Praxio data.
async function signOut() {
  await disableReminder().catch(() => {});
  await clearCache();
  await supabase.auth.signOut().catch(() => {});
}
function confirmSignOut() {
  if (Platform.OS === 'web') { signOut(); return; }
  Alert.alert('Sign out of Praxio?', 'You can connect again any time with a code from the website.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
  ]);
}

export default function Profile({ profile, email, data }) {
  const t = useTheme();
  const ctx = userContext(profile ?? {});
  return (
    <Screen>
      <Headline lead="Your" accent="profile." />
      <Card style={{ gap: 6 }}>
        <T kind="medium" size={20}>{profile?.full_name || 'Praxio member'}</T>
        {email ? <T color={t.c.text2}>{email}</T> : null}
        <T size={14} color={t.c.text3}>{ctx.stageLabel}</T>
      </Card>

      <Label>Theme</Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: t.c.surface2, borderRadius: 999, padding: 4 }}>
        {MODES.map(([id, label]) => {
          const on = t.mode === id;
          return (
            <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => t.setMode(id)}
              style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.surface : 'transparent' }}>
              <T kind={on ? 'medium' : 'regular'} size={15} color={on ? t.c.text : t.c.text2}>{label}</T>
            </Pressable>
          );
        })}
      </View>

      {remindersSupported && <ReminderCard data={data} />}

      <Card soft style={{ gap: 6 }}>
        <T kind="medium">Everything else lives on the web</T>
        <T size={14} color={t.c.text2}>Assessment, feasibility, market research, family alignment and the advisor.</T>
        <Button kind="link" title="Open Praxio on the web →" onPress={() => Linking.openURL(WEB_URL)} />
      </Card>

      <Button kind="ghost" title="Sign out" onPress={() => confirmSignOut()} />
    </Screen>
  );
}

function ReminderCard({ data }) {
  const t = useTheme();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { readReminder().then(setState); }, []);
  if (!state) return null;

  const apply = async (enabled, time) => {
    setBusy(true);
    setNote('');
    if (enabled) {
      const res = await enableReminder(time, reminderText(data));
      if (res.ok) { setState(res.state); haptic('success'); } else { setState({ ...state, enabled: false, time }); setNote(res.reason); haptic('error'); }
    } else {
      setState(await disableReminder());
      haptic();
    }
    setBusy(false);
  };
  const when = REMINDER_TIMES.find((x) => x.id === state.time) ?? REMINDER_TIMES[1];

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T kind="medium">Daily nudge</T>
          <T size={14} color={t.c.text2}>{state.enabled ? `Every day at ${String(when.hour).padStart(2, '0')}:${String(when.minute).padStart(2, '0')}` : 'One reminder a day about your next step.'}</T>
        </View>
        <Switch
          value={Boolean(state.enabled)}
          disabled={busy}
          onValueChange={(v) => apply(v, state.time)}
          trackColor={{ false: t.c.surface2, true: t.c.accent }}
          thumbColor={t.c.surface}
          accessibilityLabel="Daily nudge"
        />
      </View>
      {state.enabled && (
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: t.c.surface2, borderRadius: 999, padding: 4 }}>
          {REMINDER_TIMES.map((x) => {
            const on = state.time === x.id;
            return (
              <Pressable key={x.id} accessibilityRole="radio" accessibilityState={{ checked: on }} disabled={busy}
                onPress={() => { if (!on) apply(true, x.id); }}
                style={{ flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.surface : 'transparent' }}>
                <T size={14} kind={on ? 'medium' : 'regular'} color={on ? t.c.text : t.c.text2}>{x.label}</T>
              </Pressable>
            );
          })}
        </View>
      )}
      {state.enabled && state.body ? <T size={13} color={t.c.text3}>“{state.body}”</T> : null}
      {note ? <T size={13} color={t.c.warn}>{note}</T> : null}
    </Card>
  );
}
