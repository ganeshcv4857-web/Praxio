// The student-profile feature model. Every feature normalises to 0..100 so that
// domain weight vectors (careers.js) can be applied uniformly.

export const BRANCHES = [
  { id: 'cse', label: 'Computer Science / IT' },
  { id: 'ece', label: 'Electronics & Communication' },
  { id: 'eee', label: 'Electrical & Electronics' },
  { id: 'mech', label: 'Mechanical' },
  { id: 'civil', label: 'Civil' },
  { id: 'chem', label: 'Chemical' },
  { id: 'bio', label: 'Biotechnology / Biomedical' },
  { id: 'aero', label: 'Aerospace / Automobile' },
  { id: 'other', label: 'Other' },
];

// Interests: "How much do you enjoy…" rated 1..5.
export const INTERESTS = [
  { key: 'int_software', label: 'Building software & apps' },
  { key: 'int_data_ai', label: 'Working with data, statistics & AI' },
  { key: 'int_electronics', label: 'Circuits, chips & electronics' },
  { key: 'int_mechanical', label: 'Machines, mechanisms & physical products' },
  { key: 'int_infrastructure', label: 'Buildings, cities & infrastructure' },
  { key: 'int_design', label: 'Visual design & how people use products' },
  { key: 'int_business', label: 'Business, strategy & markets' },
  { key: 'int_people', label: 'Teaching, mentoring & working with people' },
  { key: 'int_research', label: 'Open-ended research & discovery' },
  { key: 'int_security', label: 'Security, hacking & breaking systems' },
  { key: 'int_bio', label: 'Biology, health & medicine' },
  { key: 'int_sustainability', label: 'Energy, climate & sustainability' },
  { key: 'int_finance', label: 'Finance, trading & economics' },
];

// Aptitude: self-rated 1..5, blended with the short measured quiz (quiz.js).
export const APTITUDES = [
  { key: 'apt_logical', label: 'Logical reasoning' },
  { key: 'apt_quant', label: 'Quantitative / maths' },
  { key: 'apt_verbal', label: 'Verbal & written communication' },
  { key: 'apt_spatial', label: 'Spatial / visual thinking' },
  { key: 'apt_programming', label: 'Programming' },
];

// Personal characteristics: "How well does this describe you?" rated 1..5.
export const TRAITS = [
  { key: 'tr_curiosity', label: 'I dig into how things work, even when not required' },
  { key: 'tr_detail', label: 'I am careful and precise; small errors bother me' },
  { key: 'tr_sociability', label: 'I get energy from talking and working with others' },
  { key: 'tr_persistence', label: 'I keep at hard problems for a long time' },
  { key: 'tr_creativity', label: 'I like coming up with new ideas and approaches' },
  { key: 'tr_risk', label: 'I am comfortable with uncertainty and risk' },
];

// Preferences: bipolar sliders stored 0..100 (left label = 0, right label = 100).
export const PREFERENCES = [
  { key: 'pref_team', left: 'Work mostly alone', right: 'Work mostly in teams' },
  { key: 'pref_research', left: 'Applied, shipping things', right: 'Research, deep theory' },
  { key: 'pref_stability', left: 'Novelty & risk', right: 'Stability & predictability' },
  { key: 'pref_hands_on', left: 'At a screen', right: 'Hands-on / lab / field' },
  { key: 'pref_coding', left: 'Little coding', right: 'Coding all day' },
  { key: 'pref_study', left: 'Start working after degree', right: 'Open to a master’s / PhD' },
];

// Every feature the scorer understands, with a human label for UI + prompts.
export const FEATURE_LABELS = {
  ...Object.fromEntries(INTERESTS.map((f) => [f.key, `Interest: ${f.label}`])),
  ...Object.fromEntries(APTITUDES.map((f) => [f.key, `Aptitude: ${f.label}`])),
  ...Object.fromEntries(TRAITS.map((f) => [f.key, `Trait: ${f.label}`])),
  pref_team: 'Prefers teamwork',
  pref_solo: 'Prefers independent work',
  pref_research: 'Prefers research over applied work',
  pref_applied: 'Prefers applied work over research',
  pref_stability: 'Values stability',
  pref_novelty: 'Values novelty & risk',
  pref_hands_on: 'Prefers hands-on / physical work',
  pref_screen: 'Prefers screen-based work',
  pref_coding: 'Wants coding-heavy work',
  pref_study: 'Open to further study',
  branch_fit: 'Fit with your engineering branch',
};

const fromLikert = (v) => (v == null ? null : Math.round(((Number(v) - 1) / 4) * 100));

/**
 * Turn a stored profile into a flat { feature: 0..100 } map.
 * Missing answers are left out (NOT defaulted) so the scorer can tell measured
 * signals from gaps; `branch_fit` is computed per domain in scoring.js.
 */
export function buildFeatures(profile) {
  const out = {};
  const put = (k, v) => { if (v != null && !Number.isNaN(v)) out[k] = Math.max(0, Math.min(100, v)); };

  for (const { key } of INTERESTS) put(key, fromLikert(profile.interests?.[key]));
  for (const { key } of TRAITS) put(key, fromLikert(profile.traits?.[key]));

  for (const { key } of APTITUDES) {
    const self = fromLikert(profile.aptitude?.[key]);
    const quiz = profile.aptitude_quiz?.[key];
    // Measured quiz signal is weighted equally with self-assessment when both exist.
    if (self != null && quiz != null) put(key, Math.round(self * 0.5 + quiz * 0.5));
    else put(key, self ?? quiz);
  }

  const p = profile.preferences || {};
  const pair = (key, inverse) => {
    if (p[key] == null) return;
    put(key, Number(p[key]));
    if (inverse) put(inverse, 100 - Number(p[key]));
  };
  pair('pref_team', 'pref_solo');
  pair('pref_research', 'pref_applied');
  pair('pref_stability', 'pref_novelty');
  pair('pref_hands_on', 'pref_screen');
  pair('pref_coding');
  pair('pref_study');

  return out;
}
