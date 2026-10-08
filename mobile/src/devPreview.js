// DEVELOPMENT ONLY: realistic sample data for checking the signed-in screens without an
// account (web dev server, URL with ?preview). Built with Praxio's own logic, so the screens
// receive exactly the shapes real data has. Never used in a phone build.
import { useState } from 'react';
import { Platform } from 'react-native';
import { rankCareers, shortlist } from '../../app/src/lib/scoring.js';
import { INTERESTS, APTITUDES, TRAITS, PREFERENCES } from '../../app/src/lib/features.js';
import * as F from '../../app/src/lib/feasibility/config.js';
import { evaluateAll, isComplete } from '../../app/src/lib/feasibility/scoring.js';
import { rankPathways } from '../../app/src/lib/development/pathways.js';
import { deriveProgress, pathwayStages } from '../../app/src/lib/development/learning.js';
import { COURSE_BY_ID } from '../../app/src/lib/development/catalog.js';
import { buildDecisionInputs } from '../../app/src/lib/decisionInputs.js';
import { decide } from '../../app/src/lib/decision/engine.js';

export const PREVIEW = typeof __DEV__ !== 'undefined' && __DEV__ && Platform.OS === 'web'
  && typeof window !== 'undefined' && /[?&]preview\b/.test(window.location?.search ?? '');

const score = (list, hi) => Object.fromEntries(list.map((x, i) => [x.key, hi.includes(x.key) ? 5 : (i % 3) + 2]));

function build() {
  const profile = {
    id: 'preview', full_name: 'Asha Rao', current_stage: 'school_12', primary_goal: 'choose_degree', school_stream: 'pcm',
    interests: score(INTERESTS, ['int_software', 'int_data_ai']), aptitude: score(APTITUDES, ['apt_programming', 'apt_logical']),
    traits: score(TRAITS, []), preferences: score(PREFERENCES, ['pref_coding']), onboarded_at: '2026-10-01T00:00:00Z',
  };
  const recs = shortlist(rankCareers(profile));
  const inputs = {
    income_band: F.INCOME_BANDS[2].id, education_budget: F.BUDGET_BANDS[2].id, loan_willingness: F.LOAN_OPTIONS[1].id,
    risk_tolerance: F.RISK_LEVELS[1].id, education_preference: F.EDUCATION_OPTIONS[1].id, relocation: F.RELOCATION_OPTIONS[1].id,
    family_priorities: [F.FAMILY_PRIORITIES[0].id], primary_funder: 'family', scholarship_interest: 'no',
  };
  const pathways = rankPathways(recs, inputs);
  const chosen = pathways[0];
  const firstCourse = chosen.stages.find((s) => s.kind === 'course');
  const course = COURSE_BY_ID[firstCourse.courseId];
  const [m1, m2] = course.modules;
  const dev = {
    plan: null,
    coursePlans: [{ course_id: course.id }],
    moduleProgress: [{ course_id: course.id, module_id: m1.id, status: 'completed' }],
    challenges: [{
      id: 'preview-challenge', course_id: course.id, module_id: m1.id, status: 'open',
      title: m1.project?.title ?? 'Starter project', description: m1.project?.brief ?? '', requirements: m1.project?.requirements ?? [],
      skills: m1.skills,
    }],
    submissions: [], evaluations: [], skills: [], rewards: [],
  };
  void m2;
  const progress = deriveProgress(dev);
  const decision = decide(buildDecisionInputs({ profile, recs, inputs, dev, marketById: {}, academicRecords: null }));
  return {
    profile, recs, inputs, dev, decision, progress, chosen, stages: pathwayStages(chosen, progress),
    feasibility: isComplete(inputs) ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {},
    m1Done: true, m2Done: isComplete(inputs), errors: [],
  };
}

export function usePreviewData() {
  const [data] = useState(build);
  return { data, loading: false, error: null, reload: async () => {} };
}

export const PREVIEW_SESSION = { user: { id: 'preview', email: 'asha@example.com' } };
