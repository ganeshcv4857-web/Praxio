import { Linking, View } from 'react-native';
import { CAREER_BY_ID } from '../../../app/src/lib/careers.js';
import { userContext } from '../../../app/src/lib/userContext.js';
import { WEB_URL } from '../supabaseClient.js';
import { timeAgo, weeklyActivity } from '../model.js';
import { useTheme } from '../theme.js';
import { Bar, Button, Card, Chip, Headline, Label, Notice, Screen, T } from '../ui.js';

// Home: where you stand, the one next move, and progress at a glance.

// Next-move types that can be acted on inside the app (tasks); everything else opens the web.
const IN_APP = new Set(['trial_project', 'build_skill', 'complete_project', 'pursue_certification', 'map_transferable_skills']);
const STEPS = ['Discovered', 'Understood', 'Validated', 'Building', 'Ready'];

export default function Today({ data, loading, reload, offline, updatedAt, profile, goTasks }) {
  const t = useTheme();
  const d = data ?? {};
  const ctx = userContext(profile ?? {});
  const firstName = profile?.full_name?.trim().split(' ')[0];
  const { m1Done, m2Done, progress, stages = [], dev, decision, recs = [], chosen } = d;
  const courses = stages.filter((s) => s.kind === 'course');
  const done = courses.reduce((s, c) => s + (c.progress?.done ?? 0), 0);
  const total = courses.reduce((s, c) => s + (c.progress?.total ?? 0), 0);
  const passed = (dev?.challenges ?? []).filter((c) => c.status === 'passed').length;
  const m3Started = Boolean(dev && (dev.plan || dev.coursePlans?.length || dev.moduleProgress?.length));

  const pos = !m1Done
    ? ['You’re at a', 'starting point.']
    : !m2Done ? ['You’ve found a', 'direction.']
      : !m3Started ? ['You’re ready to', 'build.']
        : ['You’re', 'building.'];
  const stepDone = [Boolean(m1Done), Boolean(m1Done), Boolean(m2Done), m3Started, total > 0 && done === total];
  const current = stepDone.findIndex((x) => !x);

  let move;
  if (!m1Done) {
    move = { title: 'Take your career assessment', why: 'About 10 minutes, best on a bigger screen. Everything else builds on it.', cta: 'Open on web', act: () => Linking.openURL(WEB_URL) };
  } else if (decision?.nextAction) {
    const a = decision.nextAction;
    const inApp = IN_APP.has(a.type) && m2Done;
    move = { title: a.title, why: a.reasons?.[0]?.text, cta: inApp ? 'Go to tasks' : 'Open on web', act: inApp ? goTasks : () => Linking.openURL(WEB_URL) };
  } else {
    move = { title: 'Your next step is on the web', why: 'Praxio couldn’t work out your next move on this device right now.', cta: 'Open on web', act: () => Linking.openURL(WEB_URL) };
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <T kind="bold" size={22} style={{ letterSpacing: -1.2 }}>praxio<T kind="bold" size={22} color={t.c.accent}>.</T></T>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Label>Your position{firstName ? ` · ${firstName}` : ''} · {ctx.stageLabel}</Label>
        <Headline lead={pos[0]} accent={pos[1]} size={44} />
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: stepDone[i] ? t.c.accent : i === current ? t.c.accentSoft : t.c.line }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={13} color={t.c.text3}>{STEPS[Math.max(0, current === -1 ? 4 : current - 1)]}</T>
          {current !== -1 && <T size={13} color={t.c.accent}>Next: {STEPS[current]}</T>}
        </View>
      </View>

      {offline
        ? <Notice>You’re offline. Showing what Praxio had {timeAgo(updatedAt)}; pull down to refresh.</Notice>
        : d.errors?.length > 0
          ? <Notice>Some parts couldn’t load. Pull down to retry.</Notice>
          : updatedAt ? <T size={13} color={t.c.text3}>{loading ? 'Refreshing…' : `Updated ${timeAgo(updatedAt)}`}</T> : null}

      <Card style={{ gap: 14, marginTop: 6 }}>
        <Chip tone="info">Your next move</Chip>
        <T kind="medium" size={24} style={{ letterSpacing: -0.6, lineHeight: 30 }}>{move.title}</T>
        {move.why ? <T color={t.c.text2}>{move.why}</T> : null}
        {decision?.direction && <T size={14} color={t.c.text3}>Direction: {decision.direction.name} · {decision.direction.fitTier} fit</T>}
        <Button title={`${move.cta} →`} onPress={move.act} />
      </Card>

      {m2Done && dev && <WeekCard dev={dev} />}

      {m1Done && (
        <Card style={{ gap: 16 }}>
          <Label>Progress{chosen ? ` · ${CAREER_BY_ID[chosen.careerId]?.name ?? ''}` : ''}</Label>
          {m2Done ? (
            <>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={14} color={t.c.text2}>Modules learned</T><T size={14}>{done} of {total}</T>
                </View>
                <Bar pct={total ? (done / total) * 100 : 0} color={t.c.text3} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat label="Projects passed" value={passed} />
                <Stat label="Skills shown" value={progress?.demonstratedSkills?.length ?? 0} />
                <Stat label="Points" value={progress?.points ?? 0} />
              </View>
            </>
          ) : (
            <T color={t.c.text2}>Your learning path appears once you finish the feasibility check on the web.</T>
          )}
        </Card>
      )}

      {m1Done && recs[0] && (
        <Card soft style={{ gap: 6 }}>
          <Label>Strongest match</Label>
          <T kind="medium" size={18}>{CAREER_BY_ID[recs[0].domainId]?.name ?? recs[0].domainId}</T>
        </Card>
      )}
    </Screen>
  );
}

function Stat({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.surface2, borderRadius: 16, padding: 12, gap: 2 }}>
      <T kind="semibold" size={22}>{String(value)}</T>
      <T size={12} color={t.c.text3}>{label}</T>
    </View>
  );
}

function WeekCard({ dev }) {
  const t = useTheme();
  const w = weeklyActivity(dev);
  const peak = Math.max(1, ...w.days.map((d) => d.modules + d.projects));
  const parts = [];
  if (w.modules) parts.push(`${w.modules} module${w.modules === 1 ? '' : 's'}`);
  if (w.projects) parts.push(`${w.projects} project${w.projects === 1 ? '' : 's'} submitted`);
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Label>This week</Label>
        {w.streak > 1 ? <T size={13} color={t.c.accent}>{w.streak}-day streak</T> : null}
      </View>
      <View accessibilityLabel={`Active on ${w.activeDays} of the last 7 days`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 64 }}>
        {w.days.map((d) => {
          const n = d.modules + d.projects;
          return (
            <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{
                width: '100%', height: n ? 10 + (38 * n) / peak : 6, borderRadius: 6,
                backgroundColor: n ? t.c.accent : t.c.surface2, borderWidth: d.today ? 1.5 : 0, borderColor: t.c.text3,
              }} />
              <T size={11} color={d.today ? t.c.text : t.c.text3}>{d.label}</T>
            </View>
          );
        })}
      </View>
      <T size={14} color={t.c.text2}>
        {parts.length ? `${parts.join(' · ')} in the last 7 days.` : 'Nothing logged in the last 7 days. One module today gets you moving.'}
      </T>
    </Card>
  );
}
