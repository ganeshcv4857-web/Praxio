import { CAREER_BY_ID } from '../../lib/careers.js';
import { COURSE_BY_ID, PROGRAMMES, courseSkills, formatPrice } from '../../lib/development/catalog.js';
import { PATHWAY_TYPES, pathwayChain } from '../../lib/development/pathways.js';
import { pathwayStages, rankCourses } from '../../lib/development/learning.js';
import { PATH_WEIGHTS, PASS_SCORE } from '../../lib/development/config.js';
import { Btn, Fact, Meter, More, Panel, PageHead, Row, Rows, Status, Summary } from '../ui/kit.jsx';
import { SkillList } from './parts.jsx';

// Module 3 overview. Answer first: the one thing to do next. The path is a list of
// stages that open for detail; scoring, alternatives and extra courses stay collapsed.

const COMPONENT_LABELS = { careerFit: 'Career fit', feasibility: 'Feasibility', budget: 'Budget compatibility', study: 'Fits your study plans', requirement: 'Meets career requirements' };
const STAGE_STATUS = { done: ['good', 'Done'], current: ['info', 'Up next'], upcoming: ['muted', 'Later'] };

function NextUp({ stages, dev, progress, nav, onStart }) {
  const project = dev.challenges.find((c) => c.status === 'needs_improvement') ?? dev.challenges.find((c) => c.status === 'open');
  const current = stages.find((s) => s.kind === 'course' && s.status === 'current');
  let title; let body; let cta;
  if (project) {
    title = project.status === 'needs_improvement' ? `Improve your project: ${project.title}` : `Build your project: ${project.title}`;
    body = project.status === 'needs_improvement' ? 'Your last submission needs work. Use the feedback and resubmit.' : `Passing it (score ≥ ${PASS_SCORE}) turns what you learned into demonstrated skill.`;
    cta = <Btn onClick={() => nav.project(project.id)}>Open project →</Btn>;
  } else if (current) {
    const c = COURSE_BY_ID[current.courseId];
    const started = progress.isStarted(c.id) || current.progress.done > 0;
    title = started ? `Continue ${c.title}` : `Start ${c.title}`;
    body = started ? `Next module: ${current.progress.next?.title ?? 'review the course'} · ${current.progress.done} of ${current.progress.total} done` : `${c.provider} · ${c.duration} · ${formatPrice(c.price)}`;
    cta = <Btn onClick={() => (started ? nav.course(c.id) : onStart(c.id))}>{started ? 'Continue →' : 'Start course →'}</Btn>;
  } else {
    title = 'Every course on this path is complete.';
    body = 'Review your demonstrated skills, or follow another path below.';
  }
  return (
    <Panel className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10" />
      <Status tone="info" className="relative">Your next move</Status>
      <h2 className="relative mt-5 max-w-2xl text-[28px] font-medium leading-tight tracking-[-0.03em]">{title}</h2>
      <p className="relative mt-3 text-slate-400">{body}</p>
      {cta && <div className="relative mt-6">{cta}</div>}
    </Panel>
  );
}

function StageRow({ stage, index, progress, nav, onStart }) {
  if (stage.kind === 'programme') {
    const p = PROGRAMMES[stage.programme];
    return (
      <Row title={p.title} sub={`Stage ${index + 1} · Higher studies · ${p.provider}`} meta={<Status tone="muted">Later</Status>}>
        <p className="text-sm text-slate-400">Approx. {formatPrice(p.price)} · {p.duration}</p>
        <ol className="mt-4 space-y-2 text-[15px] text-slate-300">{p.steps.map((s) => <li key={s}>→ {s}</li>)}</ol>
      </Row>
    );
  }
  if (stage.kind !== 'course') {
    return <Row title={stage.title} sub={`Stage ${index + 1} · Milestone`} meta={<Status tone="muted">Milestone</Status>}><p className="text-slate-400">A checkpoint on your path; nothing to do here yet.</p></Row>;
  }
  const c = COURSE_BY_ID[stage.courseId];
  const [tone, word] = STAGE_STATUS[stage.status] ?? STAGE_STATUS.upcoming;
  const started = progress.isStarted(c.id) || stage.progress.done > 0;
  return (
    <Row
      title={c.title}
      sub={`Stage ${index + 1} · ${stage.title}`}
      meta={<><span className="text-sm tabular-nums text-slate-500">{stage.progress.done}/{stage.progress.total}</span><Status tone={tone}>{word}</Status></>}
      defaultOpen={stage.status === 'current'}
    >
      <Meter label="Modules learned" value={stage.progress.pct} right={`${stage.progress.done} of ${stage.progress.total}`} />
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Fact label="Provider">{c.provider}</Fact>
        <Fact label="Time">{c.duration}</Fact>
        <Fact label="Cost">{formatPrice(c.price)}{stage.overCap && <span className="block text-sm text-amber-300">Above your usual course budget</span>}</Fact>
      </div>
      <div className="mt-5"><Fact label="Skills you'll learn">{courseSkills(c).slice(0, 8).join(' · ')}</Fact></div>
      <div className="mt-6">
        {started
          ? <Btn kind="ghost" onClick={() => nav.course(c.id)}>{stage.progress.complete ? 'Review course' : 'Continue course →'}</Btn>
          : <Btn onClick={() => onStart(c.id)}>Start course →</Btn>}
      </div>
    </Row>
  );
}

export default function Overview({ pathways, recommended, chosen, inputs, dev, progress, actions, nav }) {
  const career = CAREER_BY_ID[chosen.careerId];
  const stages = pathwayStages(chosen, progress);
  const courseStages = stages.filter((s) => s.kind === 'course');
  const total = courseStages.reduce((s, st) => s + st.progress.total, 0);
  const done = courseStages.reduce((s, st) => s + st.progress.done, 0);
  const passed = dev.challenges.filter((c) => c.status === 'passed').length;
  const isRecommended = chosen.id === recommended.id;
  const others = pathways.filter((p) => p.id !== chosen.id).slice(0, 8);
  const extra = rankCourses(chosen.careerId, chosen, inputs, progress).filter((r) => !r.inPath).slice(0, 6);

  return (
    <div>
      <PageHead eyebrow={`Development · ${career.name} · ${PATHWAY_TYPES[chosen.type].short}`} title="Learn it." accent="Then prove it."
        lede="Finishing a module means you’ve learned it. Passing its project means you’ve demonstrated it, and only that counts as evidence." />

      <Summary>
        <Status tone="info">{done} of {total} modules learned</Status>
        <Status tone={passed ? 'good' : 'muted'}>{passed} project{passed === 1 ? '' : 's'} passed</Status>
        <Status tone={progress.demonstratedSkills.length ? 'good' : 'muted'}>{progress.demonstratedSkills.length} skills demonstrated</Status>
        {progress.points > 0 && <Status tone="warn">{progress.points} points</Status>}
      </Summary>

      <NextUp stages={stages} dev={dev} progress={progress} nav={nav} onStart={actions.startCourse} />

      <h2 className="mb-4 mt-14 text-[26px] font-normal tracking-[-0.03em]">Your path</h2>
      <Rows>
        {stages.map((s, i) => <StageRow key={`${s.title}-${i}`} stage={s} index={i} progress={progress} nav={nav} onStart={actions.startCourse} />)}
      </Rows>

      <div className="mt-12 space-y-1">
        <More label="Skills: learned vs demonstrated">
          <div className="grid gap-6 sm:grid-cols-2">
            <div><p className="mb-2 text-slate-300">Learned</p><SkillList skills={progress.learnedSkills} empty="Complete a module to start learning skills" /></div>
            <div><p className="mb-2 text-emerald-300">Demonstrated</p><SkillList skills={progress.learnedSkills} demonstrated={progress.demonstratedSkills} empty="Pass a project to demonstrate a skill" mode="demonstrated" /></div>
          </div>
        </More>
        <More label={`Why this path (${chosen.score}/100)`}>
          <p className="text-slate-300">{pathwayChain(chosen)}</p>
          <ul className="mt-3 space-y-1">{chosen.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(PATH_WEIGHTS).map(([k, w]) => <Meter key={k} label={`${COMPONENT_LABELS[k]} · ${Math.round(w * 100)}%`} value={chosen.components[k]} right={chosen.components[k]} />)}
          </div>
        </More>
        <More label={`Other paths (${others.length})`}>
          {!isRecommended && (
            <p className="mb-3 text-slate-300">Praxio’s top recommendation is {CAREER_BY_ID[recommended.careerId].name} · {PATHWAY_TYPES[recommended.type].short} ({recommended.score}/100).{' '}
              <button type="button" className="font-medium text-indigo-300 hover:text-slate-100" onClick={() => actions.choosePathway(recommended)}>Switch to it</button></p>
          )}
          <ul className="space-y-2">
            {others.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-slate-200">{CAREER_BY_ID[p.careerId].name} · <span className="text-slate-400">{PATHWAY_TYPES[p.type].short}</span> <span className="tabular-nums text-slate-500">{p.score}</span></span>
                <button type="button" className="min-h-[36px] font-medium text-indigo-300 hover:text-slate-100" onClick={() => actions.choosePathway(p)}>Follow</button>
              </li>
            ))}
          </ul>
        </More>
        {extra.length > 0 && (
          <More label={`More courses for ${career.name} (${extra.length})`}>
            <ul className="space-y-3">
              {extra.map(({ course: c, affordable }) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span><span className="text-slate-200">{c.title}</span> <span className="text-slate-500">· {c.provider} · {c.duration} · </span><span className={affordable ? 'text-emerald-300' : 'text-amber-300'}>{formatPrice(c.price)}</span></span>
                  <button type="button" className="min-h-[36px] font-medium text-indigo-300 hover:text-slate-100" onClick={() => (progress.isStarted(c.id) ? nav.course(c.id) : actions.startCourse(c.id))}>{progress.isStarted(c.id) ? 'Continue' : 'Start'}</button>
                </li>
              ))}
            </ul>
          </More>
        )}
        <More label="About these numbers">Course catalog, prices and programme costs are curated prototype estimates. Your budget comes from your feasibility answers.</More>
      </div>
    </div>
  );
}
