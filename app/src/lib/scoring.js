// Career Suitability Score: a normalised weighted sum of profile features.
//
//   score(domain) = Σ wᵢ·xᵢ / Σ wᵢ      over features the student actually answered
//
// Unlike a clamped/floored index, the score is never padded: unanswered features
// are dropped from both numerator and denominator, and `coverage` reports how much
// of the domain's weight was backed by real answers. The per-feature breakdown is
// returned so the explanation layer can cite exactly what drove the score.

import { CAREERS } from './careers.js';
import { buildFeatures } from './features.js';

export const SHORTLIST_MIN = 5;
export const SHORTLIST_MAX = 8;
// Domains scoring this far below the top match are dropped (down to SHORTLIST_MIN).
export const SHORTLIST_SPREAD = 20;

export function branchFit(branch, domain) {
  if (!branch) return null;
  if (domain.branches.includes(branch)) return 100;
  return branch === 'other' ? 50 : 30;
}

export function scoreDomain(features, domain, branch) {
  const totalWeight = Object.values(domain.weights).reduce((a, b) => a + b, 0);
  const rows = [];
  let usedWeight = 0;

  for (const [feature, w] of Object.entries(domain.weights)) {
    const value = feature === 'branch_fit' ? branchFit(branch, domain) : features[feature];
    if (value == null) continue;
    usedWeight += w;
    rows.push({ feature, weight: w, value });
  }

  if (usedWeight === 0) return { domainId: domain.id, score: 0, coverage: 0, breakdown: [] };

  const breakdown = rows
    .map((r) => {
      const share = r.weight / usedWeight;
      return {
        feature: r.feature,
        weight: Math.round(share * 1000) / 1000,
        value: r.value,
        contribution: Math.round(share * r.value * 10) / 10,
        // How many points this feature cost vs. a perfect 100 on it.
        shortfall: Math.round(share * (100 - r.value) * 10) / 10,
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  const score = Math.round(breakdown.reduce((s, r) => s + r.contribution, 0) * 10) / 10;
  return {
    domainId: domain.id,
    score,
    coverage: Math.round((usedWeight / totalWeight) * 100) / 100,
    breakdown,
  };
}

/** Score every domain for a profile, highest first. */
export function rankCareers(profile, catalog = CAREERS) {
  const features = buildFeatures(profile);
  return catalog
    .map((d) => scoreDomain(features, d, profile.branch))
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);
}

/** Ranked 5–8 domain shortlist. */
export function shortlist(ranked) {
  if (ranked.length === 0) return [];
  const top = ranked[0].score;
  const out = [];
  for (const r of ranked) {
    if (out.length >= SHORTLIST_MAX) break;
    if (out.length >= SHORTLIST_MIN && r.score < top - SHORTLIST_SPREAD) break;
    out.push(r);
  }
  return out.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Top strengths and gaps for a scored domain — the explanation's grounding facts. */
export function drivers(scored, n = 3) {
  const strengths = scored.breakdown.filter((r) => r.value >= 60).slice(0, n);
  const gaps = [...scored.breakdown]
    .filter((r) => r.value < 60)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 2);
  return { strengths, gaps };
}
