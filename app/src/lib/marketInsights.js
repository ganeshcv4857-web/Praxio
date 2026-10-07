// Market Intelligence: deterministic personalization on top of researched market data.
//
// Groq supplies source-backed market evidence (see supabase/functions/career-ai/market.js).
// Everything here is plain app logic that combines that evidence with Praxio's own
// authoritative data: Career Fit, Feasibility, demonstrated skills (proven by passed
// projects) and learned skills (completed modules). No LLM decides anything here, and
// nothing here writes to Career Fit, Feasibility or Module 3 records.

import { CAREER_BY_ID } from './careers.js';
import { COURSES } from './development/catalog.js';
import { categoryOf } from './feasibility/scoring.js';
import { MARKET_CONFIG } from '../../supabase/functions/career-ai/market.js';

export const MARKET_INTELLIGENCE_TTL_DAYS = MARKET_CONFIG.ttlDays;

export const DEMAND_LABEL = {
  very_high: 'Very strong demand',
  high: 'Strong demand',
  moderate: 'Moderate demand',
  low: 'Weak demand',
  mixed: 'Mixed demand',
  unknown: 'Demand unclear',
};
export const TREND_LABEL = { growing: 'growing', stable: 'stable', declining: 'declining', mixed: 'mixed', unknown: '' };

// ---------------------------------------------------------------- skill matching
const SYNONYMS = {
  ml: 'machine learning', 'machine-learning': 'machine learning',
  dl: 'deep learning', ai: 'artificial intelligence',
  'gen ai': 'generative ai', genai: 'generative ai',
  llm: 'llms', llms: 'llms', 'large language models': 'llms', 'llm engineering': 'llms',
  js: 'javascript', ts: 'typescript', postgres: 'postgresql', k8s: 'kubernetes',
  stats: 'statistics', 'data viz': 'data visualisation', 'data visualization': 'data visualisation',
  'ci/cd': 'ci cd', cicd: 'ci cd', 'aws': 'aws', 'amazon web services': 'aws',
};

export function normaliseSkill(s) {
  const base = String(s ?? '').toLowerCase().replace(/[()]/g, ' ').replace(/[^a-z0-9+#./ -]/g, ' ').replace(/\s+/g, ' ').trim();
  return SYNONYMS[base] ?? base;
}

/** True if two skill names refer to the same thing (exact after normalising, or whole-word containment). */
export function skillMatches(a, b) {
  const x = normaliseSkill(a);
  const y = normaliseSkill(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(long);
}

// ---------------------------------------------------------------- skill gap
const CATEGORY_ORDER = { core: 0, tool: 1, emerging: 2 };

/** Catalog courses/modules that teach a skill, preferring courses tagged for the career. */
function coursesTeaching(skill, careerId) {
  const hits = [];
  for (const c of COURSES) {
    // A module tagged with the skill, else the first module of a course named after it
    // (e.g. "Machine Learning" → "Machine Learning Foundations").
    const m = c.modules.find((md) => md.skills.some((s) => skillMatches(s, skill)))
      ?? (skillMatches(skill, c.title) ? c.modules[0] : null);
    if (m) hits.push({ courseId: c.id, moduleId: m.id, title: c.title, module: m.title, relevant: c.careers.includes(careerId), price: c.price });
  }
  return hits.sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.price - b.price).slice(0, 3);
}

/**
 * Compare market-required skills with the student's skills.
 *   demonstrated = proven by a passed, evaluated project (authoritative, from demonstrated_skills)
 *   learned      = covered by a completed module, NOT yet proven
 *   missing      = neither
 * Returns { items, counts, coreReadiness } where items are ordered core → tools → emerging.
 */
export function marketSkillGap(record, { demonstrated = [], learned = [] } = {}, careerId = null) {
  if (!record?.market) return { items: [], counts: { demonstrated: 0, learned: 0, missing: 0 }, coreReadiness: null };
  const seen = new Set();
  const items = [];
  const add = (list, category) => {
    for (const s of list ?? []) {
      const key = normaliseSkill(s.skill);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const proven = demonstrated.find((d) => skillMatches(d, s.skill));
      const studied = !proven && learned.find((l) => skillMatches(l, s.skill));
      const status = proven ? 'demonstrated' : studied ? 'learned' : 'missing';
      items.push({
        skill: s.skill,
        category,
        status,
        matchedWith: proven || studied || null,
        evidence: s.text,
        sources: s.sources,
        courses: status === 'demonstrated' ? [] : coursesTeaching(s.skill, careerId),
      });
    }
  };
  add(record.market.core_skills, 'core');
  add(record.market.tools, 'tool');
  add(record.market.emerging_skills, 'emerging');
  items.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

  const counts = { demonstrated: 0, learned: 0, missing: 0 };
  items.forEach((i) => { counts[i.status] += 1; });
  const core = items.filter((i) => i.category === 'core');
  const coreReadiness = core.length ? Math.round((core.filter((i) => i.status === 'demonstrated').length / core.length) * 100) : null;
  return { items, counts, coreReadiness };
}

/**
 * Data boundary for Module 3: market skills the student still needs to learn or prove,
 * with the catalog modules that teach them. Module 3 can consume this later; nothing
 * here changes its pathway logic.
 */
export const marketSkillTargets = (gap) =>
  gap.items.filter((i) => i.status !== 'demonstrated').map(({ skill, category, status, courses, sources }) => ({ skill, category, status, courses, sources }));

// ---------------------------------------------------------------- personalization
const list = (xs, n = 3) => {
  const a = xs.slice(0, n);
  return a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
};

/**
 * One-paragraph personalized reading of the market for this student.
 * Built from the record + gap + Praxio scores; cites nothing it can't back.
 */
export function personalSummary(record, gap, { fit = null } = {}) {
  const d = record.market.demand;
  const parts = [];
  const trend = TREND_LABEL[d.trend] ? ` and ${TREND_LABEL[d.trend]}` : '';
  parts.push(`${record.career} shows ${DEMAND_LABEL[d.level].toLowerCase()}${d.level === 'unknown' ? '' : trend} in current research.`);
  const coreDemo = gap.items.filter((i) => i.category === 'core' && i.status === 'demonstrated').map((i) => i.skill);
  const coreLearned = gap.items.filter((i) => i.category === 'core' && i.status === 'learned').map((i) => i.skill);
  const coreMissing = gap.items.filter((i) => i.category === 'core' && i.status === 'missing').map((i) => i.skill);
  if (coreDemo.length) parts.push(`You've already demonstrated ${list(coreDemo)}, which employers ask for.`);
  if (coreLearned.length) parts.push(`You've studied ${list(coreLearned)} but haven't proven ${coreLearned.length > 1 ? 'them' : 'it'} in a project yet.`);
  if (coreMissing.length) parts.push(`Your largest gap is ${coreMissing[0]}${coreMissing.length > 1 ? `, followed by ${list(coreMissing.slice(1), 2)}` : ''}.`);
  if (!coreDemo.length && !coreLearned.length && !coreMissing.length) parts.push('The research did not name specific core skills.');
  if (fit != null) parts.push(`Your Career Fit for this path is ${Math.round(fit)}%.`);
  return parts.join(' ');
}

/**
 * Opportunities and threats: researched claims (with sources) plus personal ones derived
 * from Praxio data. Every personal item states its basis; none is invented by an LLM.
 */
export function personalOpportunitiesThreats(record, gap, { fit = null, feasibility = null, inputs = null } = {}) {
  const m = record.market;
  const opps = m.opportunities.map((c) => ({ text: c.text, sources: c.sources, basis: 'market' }));
  const threats = m.threats.map((c) => ({ text: c.text, sources: c.sources, basis: 'market' }));

  // Personal opportunities
  const demo = gap.items.filter((i) => i.status === 'demonstrated');
  if (demo.length) {
    opps.unshift({ text: `You've demonstrated ${list(demo.map((i) => i.skill))}, which this market asks for.`, sources: [...new Set(demo.flatMap((i) => i.sources))], basis: 'your demonstrated skills' });
  }
  if (['high', 'very_high'].includes(m.demand.level) && fit != null && fit >= 70) {
    opps.unshift({ text: `${DEMAND_LABEL[m.demand.level]} meets a strong personal fit (${Math.round(fit)}%).`, sources: m.demand.sources, basis: 'market demand + your Career Fit' });
  }
  if (feasibility?.category === 'high') {
    opps.push({ text: `The path looks realistic for your family (${feasibility.score}% feasible).`, sources: [], basis: 'your Feasibility check' });
  }
  const remote = m.regions.filter((r) => r.scope === 'remote');
  if (remote.length && inputs?.relocation === 'no') {
    opps.push({ text: 'Remote roles exist in this field, which helps since you prefer not to relocate.', sources: [...new Set(remote.flatMap((r) => r.sources))], basis: 'market regions + your relocation preference' });
  }

  // Personal threats
  const missingCore = gap.items.filter((i) => i.category === 'core' && i.status === 'missing');
  if (missingCore.length) {
    threats.unshift({ text: `${missingCore.length} core skill${missingCore.length > 1 ? 's' : ''} not yet demonstrated: ${list(missingCore.map((i) => i.skill), 4)}.`, sources: [...new Set(missingCore.flatMap((i) => i.sources))], basis: 'market skills vs your demonstrated skills' });
  }
  if (['low', 'mixed'].includes(m.demand.level) || m.demand.trend === 'declining') {
    threats.unshift({ text: `Demand is ${m.demand.level === 'low' ? 'weak' : m.demand.level === 'mixed' ? 'mixed' : 'declining'}, so entry may be competitive.`, sources: m.demand.sources, basis: 'market demand' });
  }
  const local = m.regions.filter((r) => r.scope !== 'remote');
  if (inputs?.relocation === 'no' && local.length && !remote.length) {
    threats.push({ text: `Opportunities cluster in ${list(local.map((r) => r.region))}; you prefer not to relocate.`, sources: [...new Set(local.flatMap((r) => r.sources))], basis: 'market regions + your relocation preference' });
  }
  if (feasibility && feasibility.factors?.education?.status !== 'good' && m.education_expectations.length) {
    threats.push({ text: 'The market expects more education than you currently plan.', sources: [...new Set(m.education_expectations.flatMap((c) => c.sources))], basis: 'market education expectations + your Feasibility check' });
  }
  if (feasibility && feasibility.factors?.financial?.status === 'bad') {
    threats.push({ text: 'Education costs for this path exceed your current budget.', sources: [], basis: 'your Feasibility check' });
  }
  return { opportunities: opps.slice(0, 8), threats: threats.slice(0, 8) };
}

// ---------------------------------------------------------------- freshness
export function freshness(record, now = new Date()) {
  const researched = new Date(record.researched_at);
  const ageDays = Math.max(0, Math.floor((now - researched) / 86_400_000));
  const fresh = new Date(record.expires_at) > now;
  const when = ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;
  return {
    fresh,
    ageDays,
    label: fresh ? `Research updated ${when}` : `Market data may be outdated (researched ${when}). Refresh for current data.`,
  };
}

// ---------------------------------------------------------------- comparison
/**
 * Career comparison rows. Fit and Feasibility come from Praxio's deterministic engines
 * (passed in, never recomputed or altered here); demand comes only from cached research.
 */
export function compareCareers(recs, { feasibilityById = {}, marketById = {}, now = new Date() } = {}) {
  return recs.map((r) => {
    const f = feasibilityById[r.domainId] ?? null;
    const rec = marketById[r.domainId] ?? null;
    return {
      careerId: r.domainId,
      name: CAREER_BY_ID[r.domainId]?.name ?? r.domainId,
      fit: Math.round(r.score),
      feasibility: f ? f.score : null,
      feasibilityCategory: f ? categoryOf(f.category) : null,
      demand: rec ? rec.market.demand.level : null,
      trend: rec ? rec.market.demand.trend : null,
      researchedAt: rec ? rec.researched_at : null,
      fresh: rec ? freshness(rec, now).fresh : null,
    };
  });
}
