// Subject canonicalisation for Class 10 / Class 12 marksheets. Plain JS: shared by the
// client, the tests and (later) the academic edge function.
//
// Deterministic and conservative:
//   - only names listed here are mapped; anything else is 'unknown' (never guessed)
//   - names that could mean different subjects are 'ambiguous' (never picked silently)
//   - board subject CODES are not used yet: they are board-specific and unsourced here
// A variant (e.g. Mathematics Standard / Basic) is kept alongside the canonical id, because
// eligibility rules may later treat variants differently.

export const SUBJECTS = Object.freeze({
  mathematics: 'Mathematics',
  applied_mathematics: 'Applied Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  science: 'Science',                       // Class 10 combined science
  computer_science: 'Computer Science',
  computer_applications: 'Computer Applications',
  informatics_practices: 'Informatics Practices',
  information_technology: 'Information Technology',
  biotechnology: 'Biotechnology',
  english: 'English',
  hindi: 'Hindi',
  sanskrit: 'Sanskrit',
  social_science: 'Social Science',
  economics: 'Economics',
  accountancy: 'Accountancy',
  business_studies: 'Business Studies',
  history: 'History',
  geography: 'Geography',
  political_science: 'Political Science',
  psychology: 'Psychology',
  sociology: 'Sociology',
  physical_education: 'Physical Education',
  engineering_graphics: 'Engineering Graphics',
  statistics: 'Statistics',
  electronics: 'Electronics',
  agriculture: 'Agriculture',
  entrepreneurship: 'Entrepreneurship',
});

// normalised name → [canonical id, variant | null]
const ALIASES = {
  'mathematics': ['mathematics', null],
  'maths': ['mathematics', null],
  'math': ['mathematics', null],
  'mathematics standard': ['mathematics', 'standard'],
  'mathematics std': ['mathematics', 'standard'],
  'standard mathematics': ['mathematics', 'standard'],
  'mathematics basic': ['mathematics', 'basic'],
  'basic mathematics': ['mathematics', 'basic'],
  'applied mathematics': ['applied_mathematics', null],
  'physics': ['physics', null],
  'chemistry': ['chemistry', null],
  'biology': ['biology', null],
  'science': ['science', null],
  'computer science': ['computer_science', null],
  'computer science new': ['computer_science', null],
  'computer applications': ['computer_applications', null],
  'computer application': ['computer_applications', null],
  'informatics practices': ['informatics_practices', null],
  'information technology': ['information_technology', null],
  'biotechnology': ['biotechnology', null],
  'english': ['english', null],
  'english core': ['english', 'core'],
  'english elective': ['english', 'elective'],
  'english language and literature': ['english', 'language_literature'],
  'english language': ['english', 'language'],
  'english literature': ['english', 'literature'],
  'hindi': ['hindi', null],
  'hindi course a': ['hindi', 'course_a'],
  'hindi course b': ['hindi', 'course_b'],
  'hindi core': ['hindi', 'core'],
  'hindi elective': ['hindi', 'elective'],
  'sanskrit': ['sanskrit', null],
  'social science': ['social_science', null],
  'social studies': ['social_science', null],
  'economics': ['economics', null],
  'accountancy': ['accountancy', null],
  'accounts': ['accountancy', null],
  'business studies': ['business_studies', null],
  'history': ['history', null],
  'geography': ['geography', null],
  'political science': ['political_science', null],
  'psychology': ['psychology', null],
  'sociology': ['sociology', null],
  'physical education': ['physical_education', null],
  'engineering graphics': ['engineering_graphics', null],
  'statistics': ['statistics', null],
  'electronics': ['electronics', null],
  'agriculture': ['agriculture', null],
  'entrepreneurship': ['entrepreneurship', null],
};

// Names that genuinely refer to more than one subject: never resolved automatically.
const AMBIGUOUS = {
  'computer': ['computer_science', 'computer_applications'],
  'computers': ['computer_science', 'computer_applications'],
  'cs': ['computer_science', 'computer_applications'],
  'ip': ['informatics_practices', 'information_technology'],
  'it': ['information_technology', 'informatics_practices'],
  'maths stats': ['mathematics', 'statistics'],
  'mathematics and statistics': ['mathematics', 'statistics'],
  'english hindi': ['english', 'hindi'],
};

/** Lower-case, drop marksheet decorations (codes, "(theory)", punctuation), collapse spaces. */
export function normaliseSubjectName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\((theory|th|practical|pr)\)/g, ' ')
    .replace(/^\s*\d{2,3}\s*[-:.]?\s*/, '')     // leading subject code, e.g. "041 Mathematics"
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * { canonical, variant, status: 'known' | 'ambiguous' | 'unknown', candidates }
 * Never maps a name that is not explicitly listed.
 */
export function canonicaliseSubject(name) {
  const key = normaliseSubjectName(name);
  if (!key) return { canonical: null, variant: null, status: 'unknown', candidates: [] };
  if (AMBIGUOUS[key]) return { canonical: null, variant: null, status: 'ambiguous', candidates: [...AMBIGUOUS[key]] };
  const hit = ALIASES[key];
  if (hit) return { canonical: hit[0], variant: hit[1], status: 'known', candidates: [] };
  return { canonical: null, variant: null, status: 'unknown', candidates: [] };
}

export const isKnownSubject = (id) => Object.hasOwn(SUBJECTS, id);
export const subjectLabel = (id) => SUBJECTS[id] ?? id;
