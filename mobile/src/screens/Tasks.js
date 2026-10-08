import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completeModuleFlow, submitAndEvaluate } from '../../../app/src/lib/development/service.js';
import { PASS_SCORE } from '../../../app/src/lib/development/config.js';
import { WEB_URL } from '../supabaseClient.js';
import { haptic } from '../haptics.js';
import { pathCourses } from '../model.js';
import { font, useTheme } from '../theme.js';
import { Button, Card, Chip, Headline, Label, Notice, Screen, T } from '../ui.js';

// Quick actions: submit a project's GitHub repo, mark a module complete.
// Both use the website's own flows (service.js), so scoring and rewards are identical.

// Evaluation text can be AI-written: only ever render plain strings.
const asText = (v) => (typeof v === 'string' ? v.trim() : typeof v?.text === 'string' ? v.text.trim() : '');
const textList = (v) => (Array.isArray(v) ? v.map(asText).filter(Boolean) : []);

const confirm = (title, message) => new Promise((resolve) => {
  if (Platform.OS === 'web') { resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Mark complete', onPress: () => resolve(true) }]);
});
const notify = (title, message) => {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`); return; }
  Alert.alert(title, message);
};

export default function Tasks({ data, loading, reload, userId }) {
  const t = useTheme();
  const d = data ?? {};
  const [submitting, setSubmitting] = useState(null); // challenge being submitted
  const [busyModule, setBusyModule] = useState(null);

  if (!d.m1Done || !d.m2Done) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <Headline lead="Your" accent="tasks." />
        <Card style={{ gap: 14 }}>
          <T kind="medium" size={20}>{!d.m1Done ? 'Start with the assessment' : 'Finish your feasibility check'}</T>
          <T color={t.c.text2}>
            {!d.m1Done
              ? 'Tasks appear once Praxio knows what fits you. The assessment takes about 10 minutes on the web.'
              : 'Your learning path, modules and projects unlock after the feasibility check on the web.'}
          </T>
          <Button title="Open on web →" onPress={() => Linking.openURL(WEB_URL)} />
        </Card>
      </Screen>
    );
  }

  const dev = d.dev;
  const challenges = dev?.challenges ?? [];
  const todo = challenges.filter((c) => c.status === 'open' || c.status === 'needs_improvement');
  // Latest evaluation per project, newest first.
  const evaluations = dev?.evaluations ?? [];
  const history = challenges
    .map((challenge) => ({
      challenge,
      evaluation: evaluations.filter((e) => e.challenge_id === challenge.id)
        .sort((a, b) => String(b.evaluated_at ?? '').localeCompare(String(a.evaluated_at ?? '')))[0],
    }))
    .filter((h) => h.evaluation)
    .sort((a, b) => String(b.evaluation.evaluated_at ?? '').localeCompare(String(a.evaluation.evaluated_at ?? '')))
    .slice(0, 6);
  const courses = pathCourses(d);

  const markComplete = async (course, m) => {
    if (!dev || !d.chosen || !course) return;
    const ok = await confirm('Mark module complete?', `"${m.title}" will count as learned and its project will unlock.`);
    if (!ok) return;
    setBusyModule(m.id);
    try {
      const challenge = await completeModuleFlow({ userId, careerId: d.chosen.careerId, courseId: course.courseId, moduleId: m.id, dev });
      await reload();
      haptic('success');
      notify('Module learned', challenge?.title ? `Project unlocked: ${challenge.title}. Submit it to prove the skill.` : 'Nice work.');
    } catch (e) {
      haptic('error');
      notify('Couldn’t save', e?.message ?? 'Please try again.');
    } finally {
      setBusyModule(null);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Headline lead="Your" accent="tasks." />
      <T color={t.c.text2}>Learn a module, then prove it with a project. Only projects count as evidence.</T>

      <Label>Projects to submit</Label>
      {todo.length === 0 ? (
        <Card soft><T color={t.c.text2}>No projects waiting. Finish a module below to unlock one.</T></Card>
      ) : todo.map((c) => (
        <Card key={c.id} style={{ gap: 10 }}>
          <Chip tone={c.status === 'needs_improvement' ? 'warn' : 'info'}>{c.status === 'needs_improvement' ? 'Needs improvement' : 'Ready to build'}</Chip>
          <T kind="medium" size={18}>{c.title}</T>
          {c.description ? <T size={14} color={t.c.text2} numberOfLines={3}>{c.description}</T> : null}
          <Button title="Submit GitHub repo →" onPress={() => setSubmitting(c)} />
        </Card>
      ))}
      {history.length > 0 && (
        <>
          <Label>Your results</Label>
          {history.map(({ challenge, evaluation }) => (
            <ResultRow key={challenge.id} challenge={challenge} evaluation={evaluation} onResubmit={() => setSubmitting(challenge)} />
          ))}
        </>
      )}

      <Label>Your path</Label>
      {courses.length === 0 ? (
        <Card soft><T color={t.c.text2}>Your learning path appears here once it’s planned on the web.</T></Card>
      ) : courses.map((c) => (
        <PathCourse key={c.courseId} course={c} busyModule={busyModule} onDone={(m) => markComplete(c, m)} />
      ))}

      <SubmitSheet
        challenge={submitting}
        onClose={() => setSubmitting(null)}
        onSubmit={async (form) => {
          const result = await submitAndEvaluate({ userId, challenge: submitting, form, dev });
          reload();
          return result;
        }}
      />
    </Screen>
  );
}

function SubmitSheet({ challenge, onClose, onSubmit }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ github_url: '', demo_url: '', explanation: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const close = () => {
    if (busy) return;
    setForm({ github_url: '', demo_url: '', explanation: '' });
    setErrors({}); setError(''); setResult(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true); setError(''); setErrors({});
    try {
      const r = await onSubmit(form);
      const ok = r?.evaluation?.passed ?? (Number.isFinite(r?.evaluation?.total_score) && r.evaluation.total_score >= PASS_SCORE);
      haptic(ok ? 'success' : 'error');
      setResult(r);
    } catch (e) {
      haptic('error');
      if (e?.fieldErrors) setErrors(e.fieldErrors);
      else setError(e?.message ?? 'Submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const input = (multi) => [{
    minHeight: multi ? 110 : 54, borderRadius: 16, paddingHorizontal: 16, paddingVertical: multi ? 14 : 0,
    backgroundColor: t.c.surface2, color: t.c.text, fontSize: 16, textAlignVertical: multi ? 'top' : 'center',
  }, font(t, 'regular')];
  const field = (key, label, props, multi = false) => (
    <View style={{ gap: 8 }}>
      <T size={14} color={t.c.text2}>{label}</T>
      <TextInput value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholderTextColor={t.c.text3}
        style={input(multi)} multiline={multi} accessibilityLabel={label} editable={!busy} {...props} />
      {errors[key] ? <T size={13} color={t.c.bad}>{errors[key]}</T> : null}
    </View>
  );
  const ev = result?.evaluation;
  const score = ev?.total_score;
  const ok = ev?.passed ?? (Number.isFinite(score) && score >= PASS_SCORE);

  return (
    <Modal visible={Boolean(challenge)} animationType="slide" presentationStyle="pageSheet" onRequestClose={close} transparent={Platform.OS === 'web'}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 22, paddingTop: Platform.OS === 'android' ? insets.top + 16 : 24, paddingBottom: insets.bottom + 40, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Submit project</Label>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ padding: 8 }}><T size={22} color={t.c.text2}>✕</T></Pressable>
          </View>
          <T kind="medium" size={24} style={{ letterSpacing: -0.6, lineHeight: 30 }}>{challenge?.title}</T>

          {result ? (
            <Card style={{ gap: 12 }}>
              <Chip tone={ok ? 'good' : 'warn'}>{ok ? 'Passed: skill demonstrated' : 'Needs improvement'}</Chip>
              {Number.isFinite(score) && <T kind="semibold" size={40}>{score}<T size={18} color={t.c.text3}>/100</T></T>}
              {result.pointsAwarded > 0 && <T color={t.c.text2}>+{result.pointsAwarded} points</T>}
              {asText(ev?.feedback) ? <T color={t.c.text2}>{asText(ev.feedback)}</T> : null}
              {textList(ev?.improvements).length ? <T size={14} color={t.c.text3}>To improve: {textList(ev.improvements).slice(0, 3).join(' · ')}</T> : null}
              <Button title="Done" onPress={close} />
            </Card>
          ) : (
            <>
              {challenge?.requirements?.length ? (
                <Card soft style={{ gap: 6 }}>
                  <T kind="medium" size={14}>What it needs</T>
                  {challenge.requirements.slice(0, 5).map((r) => <T key={r} size={14} color={t.c.text2}>• {r}</T>)}
                </Card>
              ) : null}
              {field('github_url', 'GitHub repository', { placeholder: 'https://github.com/you/project', autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url' })}
              {field('demo_url', 'Live demo (optional)', { placeholder: 'https://…', autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url' })}
              {field('explanation', 'What you built (optional)', { placeholder: 'A few lines on your approach' }, true)}
              {error ? <Notice tone="bad">{error}</Notice> : null}
              <Button title={busy ? 'Evaluating…' : 'Submit for evaluation'} busy={busy} onPress={submit} disabled={!form.github_url.trim()} />
              <T size={13} color={t.c.text3}>Praxio reads your repository and scores it. This can take up to a minute.</T>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResultRow({ challenge, evaluation, onResubmit }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const score = evaluation.total_score;
  const ok = evaluation.passed ?? (Number.isFinite(score) && score >= PASS_SCORE);
  const list = textList;
  return (
    <Card style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { haptic(); setOpen(!open); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T kind="medium" size={16} style={{ flex: 1 }} numberOfLines={open ? undefined : 1}>{challenge.title}</T>
        <Chip tone={ok ? 'good' : 'warn'}>{ok ? 'Passed' : 'Needs work'}{Number.isFinite(score) ? ` · ${score}` : ''}</Chip>
      </Pressable>
      {open && (
        <View style={{ gap: 10 }}>
          {asText(evaluation.feedback) ? <T size={15} color={t.c.text2}>{asText(evaluation.feedback)}</T> : null}
          {list(evaluation.strengths).length > 0 && (
            <View style={{ gap: 4 }}>
              <Label>Strengths</Label>
              {list(evaluation.strengths).slice(0, 3).map((x) => <T key={x} size={14}>✓ {x}</T>)}
            </View>
          )}
          {list(evaluation.improvements).length > 0 && (
            <View style={{ gap: 4 }}>
              <Label>To improve</Label>
              {list(evaluation.improvements).slice(0, 3).map((x) => <T key={x} size={14} color={t.c.text2}>→ {x}</T>)}
            </View>
          )}
          {!asText(evaluation.feedback) && !list(evaluation.strengths).length && !list(evaluation.improvements).length
            ? <T size={14} color={t.c.text3}>No written feedback for this evaluation.</T> : null}
          {!ok && <Button title="Resubmit →" onPress={onResubmit} />}
        </View>
      )}
    </Card>
  );
}

const COURSE_STATUS = { done: ['good', 'Done'], current: ['info', 'Up next'], upcoming: ['muted', 'Later'] };

function PathCourse({ course, busyModule, onDone }) {
  const t = useTheme();
  const [open, setOpen] = useState(course.status === 'current');
  const [tone, word] = COURSE_STATUS[course.status] ?? COURSE_STATUS.upcoming;
  const nextId = course.modules.find((m) => !m.done)?.id;
  return (
    <Card style={{ gap: 4, paddingVertical: open ? 14 : 18 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { haptic(); setOpen(!open); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T kind="medium" size={16}>{course.title}</T>
          <T size={13} color={t.c.text3}>{course.done} of {course.total} modules</T>
        </View>
        <Chip tone={tone}>{word}</Chip>
      </Pressable>
      {open && course.modules.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T kind={m.id === nextId ? 'medium' : 'regular'} color={m.done ? t.c.text3 : t.c.text}>{m.title}</T>
            {m.skills.length ? <T size={13} color={t.c.text3} numberOfLines={1}>{m.skills.join(' · ')}</T> : null}
          </View>
          {m.done
            ? <Chip tone="good">Learned</Chip>
            : <Button kind={m.id === nextId ? 'primary' : 'ghost'} title={busyModule === m.id ? 'Saving…' : 'Done'} busy={busyModule === m.id}
              disabled={Boolean(busyModule)} onPress={() => onDone(m)} style={{ minHeight: 40, paddingHorizontal: 16 }} />}
        </View>
      ))}
    </Card>
  );
}
