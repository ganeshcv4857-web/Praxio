import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { CAREER_BY_ID } from '../../../app/src/lib/careers.js';
import { drivers } from '../../../app/src/lib/scoring.js';
import { FEATURE_LABELS } from '../../../app/src/lib/features.js';
import { fitTier } from '../../../app/src/lib/decision/candidates.js';
import { WEB_URL } from '../supabaseClient.js';
import { useTheme } from '../theme.js';
import { Button, Card, Chip, Headline, Label, Screen, T } from '../ui.js';

// Read-only snapshot of the top matches. Tap one for the "why"; everything deeper is on the web.

const TIER = { strong: ['Strong fit', 'good'], good: ['Good fit', 'info'], moderate: ['Moderate fit', 'muted'] };
const FEAS = { high: ['Realistic', 'good'], moderate: ['Trade-offs', 'warn'], barrier: ['Real barrier', 'bad'] };

export default function Career({ data, loading, reload }) {
  const t = useTheme();
  const d = data ?? {};
  const [open, setOpen] = useState(null);
  const top = (d.recs ?? []).slice(0, 5);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Headline lead="What" accent="fits you." />
      {!d.m1Done ? (
        <Card style={{ gap: 14 }}>
          <T color={t.c.text2}>Your matches appear after the career assessment on the web.</T>
          <Button title="Open on web →" onPress={() => Linking.openURL(WEB_URL)} />
        </Card>
      ) : top.map((r, i) => {
        const career = CAREER_BY_ID[r.domainId];
        const [tierLabel, tierTone] = TIER[fitTier(r.score)] ?? TIER.moderate;
        const f = d.feasibility?.[r.domainId];
        const [feasLabel, feasTone] = f ? (FEAS[f.category] ?? []) : [];
        const isOpen = open === r.domainId || (open === null && i === 0);
        let strengths = [];
        try { strengths = drivers(r).strengths; } catch { strengths = []; }
        return (
          <Pressable key={r.domainId} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? '' : r.domainId)}>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T size={13} color={t.c.text3}>{i + 1}</T>
                <T kind="medium" size={18} style={{ flex: 1 }}>{career?.name ?? r.domainId}</T>
                <T size={20} color={t.c.text3}>{isOpen ? '–' : '+'}</T>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip tone={tierTone}>{tierLabel}</Chip>
                {feasLabel ? <Chip tone={feasTone}>{feasLabel}</Chip> : null}
              </View>
              {isOpen && (
                <View style={{ gap: 12 }}>
                  {career?.summary ? <T color={t.c.text2}>{career.summary}</T> : null}
                  {strengths.length > 0 && (
                    <View style={{ gap: 6 }}>
                      <Label>Why it fits</Label>
                      {strengths.map((s) => <T key={s.feature} size={15}>✓ {FEATURE_LABELS[s.feature] ?? s.feature}</T>)}
                    </View>
                  )}
                  {career?.roadmap?.nextSteps?.length ? (
                    <View style={{ gap: 6 }}>
                      <Label>First steps</Label>
                      {career.roadmap.nextSteps.slice(0, 2).map((s) => <T key={s} size={15} color={t.c.text2}>→ {s}</T>)}
                    </View>
                  ) : null}
                  <Button kind="link" title="Full pathway on the web →" onPress={() => Linking.openURL(WEB_URL)} />
                </View>
              )}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
