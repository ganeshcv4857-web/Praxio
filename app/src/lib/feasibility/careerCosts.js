// PROTOTYPE DATASET (hackathon): approximate figures for India, for illustration only.
// One entry per career in src/lib/careers.js, keyed by the same id.
//
//   educationCost       total cost of the typical pathway (₹, incl. undergraduate)
//   educationYears      typical total years of study for the pathway
//   typicalEducation    'ug' | 'masters' | 'masters_spec' | 'phd'  (see EDUCATION_OPTIONS)
//   higherStudyImportance  'low' | 'medium' | 'high'  — how much extra study is expected
//   relocationRequirement  'low' | 'medium' | 'high'  — 0 local jobs, 1 Indian hubs, 2 abroad/few hubs
//   financialRisk       'low' | 'medium' | 'high'  — income volatility / cost of a long pathway
//   pathwayComplexity   'low' | 'medium' | 'high'  — informational, shown in the UI
//   alignsWith          family priorities (FAMILY_PRIORITIES ids) this career typically offers

const L = 100000;

export const CAREER_COSTS = {
  'software-eng': {
    educationCost: { low: 3 * L, high: 10 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'medium', financialRisk: 'low', pathwayComplexity: 'low',
    alignsWith: ['financial_stability', 'high_salary', 'job_security', 'work_life_balance'],
  },
  'data-science': {
    educationCost: { low: 3 * L, high: 12 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'medium',
    relocationRequirement: 'medium', financialRisk: 'low', pathwayComplexity: 'medium',
    alignsWith: ['financial_stability', 'high_salary', 'work_life_balance'],
  },
  'ai-ml': {
    educationCost: { low: 4 * L, high: 15 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'medium',
    relocationRequirement: 'medium', financialRisk: 'medium', pathwayComplexity: 'high',
    alignsWith: ['high_salary', 'prestige'],
  },
  cybersecurity: {
    educationCost: { low: 3 * L, high: 10 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'medium', financialRisk: 'low', pathwayComplexity: 'medium',
    alignsWith: ['job_security', 'financial_stability', 'high_salary'],
  },
  'cloud-devops': {
    educationCost: { low: 3 * L, high: 9 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'medium', financialRisk: 'low', pathwayComplexity: 'low',
    alignsWith: ['job_security', 'financial_stability', 'high_salary'],
  },
  'embedded-iot': {
    educationCost: { low: 4 * L, high: 12 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'medium',
    relocationRequirement: 'medium', financialRisk: 'medium', pathwayComplexity: 'medium',
    alignsWith: ['job_security', 'financial_stability'],
  },
  vlsi: {
    educationCost: { low: 6 * L, high: 18 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'high',
    relocationRequirement: 'high', financialRisk: 'medium', pathwayComplexity: 'high',
    alignsWith: ['high_salary', 'prestige', 'job_security'],
  },
  robotics: {
    educationCost: { low: 8 * L, high: 20 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'medium',
    relocationRequirement: 'high', financialRisk: 'high', pathwayComplexity: 'high',
    alignsWith: ['prestige', 'entrepreneurship'],
  },
  'core-mech': {
    educationCost: { low: 3 * L, high: 9 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'medium', financialRisk: 'low', pathwayComplexity: 'low',
    alignsWith: ['job_security', 'financial_stability', 'location_proximity'],
  },
  'civil-infra': {
    educationCost: { low: 3 * L, high: 8 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'low', financialRisk: 'low', pathwayComplexity: 'low',
    alignsWith: ['job_security', 'financial_stability', 'location_proximity', 'work_life_balance'],
  },
  'energy-sustainability': {
    educationCost: { low: 4 * L, high: 12 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'medium',
    relocationRequirement: 'medium', financialRisk: 'medium', pathwayComplexity: 'medium',
    alignsWith: ['job_security', 'work_life_balance'],
  },
  biomedical: {
    educationCost: { low: 6 * L, high: 18 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'high',
    relocationRequirement: 'high', financialRisk: 'medium', pathwayComplexity: 'high',
    alignsWith: ['prestige'],
  },
  'product-management': {
    educationCost: { low: 4 * L, high: 25 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'medium',
    relocationRequirement: 'high', financialRisk: 'medium', pathwayComplexity: 'medium',
    alignsWith: ['high_salary', 'prestige'],
  },
  'ux-design': {
    educationCost: { low: 3 * L, high: 8 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'medium', financialRisk: 'medium', pathwayComplexity: 'low',
    alignsWith: ['work_life_balance'],
  },
  'research-academia': {
    educationCost: { low: 5 * L, high: 15 * L }, educationYears: 9, typicalEducation: 'phd', higherStudyImportance: 'high',
    relocationRequirement: 'high', financialRisk: 'medium', pathwayComplexity: 'high',
    alignsWith: ['prestige', 'job_security', 'work_life_balance'],
  },
  entrepreneurship: {
    educationCost: { low: 3 * L, high: 10 * L }, educationYears: 4, typicalEducation: 'ug', higherStudyImportance: 'low',
    relocationRequirement: 'low', financialRisk: 'high', pathwayComplexity: 'high',
    alignsWith: ['entrepreneurship', 'high_salary', 'location_proximity'],
  },
  'consulting-analyst': {
    educationCost: { low: 4 * L, high: 25 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'medium',
    relocationRequirement: 'high', financialRisk: 'low', pathwayComplexity: 'medium',
    alignsWith: ['high_salary', 'prestige', 'financial_stability'],
  },
  'quant-finance': {
    educationCost: { low: 6 * L, high: 25 * L }, educationYears: 6, typicalEducation: 'masters', higherStudyImportance: 'high',
    relocationRequirement: 'high', financialRisk: 'high', pathwayComplexity: 'high',
    alignsWith: ['high_salary', 'prestige'],
  },
};

export const LEVEL_INDEX = { low: 0, medium: 1, high: 2 };
export const LEVEL_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

/** "₹3–10L" style label for a cost range. */
export function formatCostRange({ low, high }) {
  const lakh = (v) => (v / L) % 1 === 0 ? String(v / L) : (v / L).toFixed(1);
  return `₹${lakh(low)}–${lakh(high)}L`;
}
export const formatLakh = (v) => `₹${(v / L) % 1 === 0 ? v / L : (v / L).toFixed(1)}L`;
