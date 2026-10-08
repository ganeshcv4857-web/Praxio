import { Linking, Pressable, View } from 'react-native';
import { userContext } from '../../../app/src/lib/userContext.js';
import { supabase, WEB_URL } from '../supabaseClient.js';
import { useTheme } from '../theme.js';
import { Button, Card, Headline, Label, Screen, T } from '../ui.js';

const MODES = [['system', 'Phone'], ['light', 'Light'], ['dark', 'Dark']];

export default function Profile({ profile, email }) {
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

      <Card soft style={{ gap: 6 }}>
        <T kind="medium">Everything else lives on the web</T>
        <T size={14} color={t.c.text2}>Assessment, feasibility, market research, family alignment and the advisor.</T>
        <Button kind="link" title="Open Praxio on the web →" onPress={() => Linking.openURL(WEB_URL)} />
      </Card>

      <Button kind="ghost" title="Sign out" onPress={() => supabase.auth.signOut().catch(() => {})} />
    </Screen>
  );
}
