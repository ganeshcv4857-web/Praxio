// Academic eligibility engine (Phase D2). Pure and deterministic: no I/O, no AI, no mutation.
//
//   academic records → existing validator → route requirements → requirement results
//                    → route result → career result
//
// Eligibility is NOT Career Fit: no score is read, written or produced here.
// A career is judged through its entry routes; one closed route never closes a career.
//
// Requirement statuses (achieved mode): satisfied | not_satisfied | unknown.
// Unknown is never failure. A requirement backed by a non-official source can never produce
// not_satisfied on its own: it is reported as unknown with `indicative: 'not_satisfied'`.
//
// Prospective mode (school_10, school_11, school_12 without a Class 12 record) never treats a
// student as having completed Class 12. Requirement statuses there: open | needs_subject |
// future | unknown.

import { ENTRY_ROUTES, ROUTES_VERSION, SOURCES } from './routes.js';
import { CAREER_ENTRY } from '../careerEntry.js';
import { userContext } from '../userContext.js';
import { STREAM_SUBJECTS, resolveSubject, subjectPercentage, validateAcademicRecords } from '../../../supabase/functions/_shared/academic/validate.js';
import { subjectLabel } from '../../../supabase/functions/_shared/academic/subjects.js';

export const DEFAULT_CATALOG = Object.freeze({ routes: ENTRY_ROUTES, sources: SOURCES, careerEntry: CAREER_ENTRY, version: ROUTES_VERSION });

const EVIDENCE_ORDER = ['self_reported', 'extracted', 'document_checked'];
const PROSPECTIVE_STAGES = ['school_10', 'school_11'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Own-property lookup: catalog keys and user-supplied ids never resolve to inherited Object members.
const own = (obj, key) => (obj != null && typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined);
const asList = (v) => (Array.isArray(v) ? v : []);

/** Weakest evidence level among the given levels (null when none). Never upgrades. */
export function weakestEvidence(levels) {
  const known = levels.filter((l) => EVIDENCE_ORDER.includes(l));
  if (!known.length) return null;
  return known.reduce((a, b) => (EVIDENCE_ORDER.indexOf(a) <= EVIDENCE_ORDER.indexOf(b) ? a : b));
}

function dedupe(remedies) {
  const seen = new Set();
  return remedies.filter((r) => {
    const k = JSON.stringify(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- evidence context
/**
 * Everything the requirements need about one qualification, read once.
 * Records are never modified; validation results come from the existing validator.
 */
function recordContext(qualification, academicRecords, validation) {
  const matches = asList(academicRecords).filter((r) => r?.qualification === qualification);
  if (!matches.length) return { qualification, record: null, issue: 'no_record' };
  if (matches.length > 1) return { qualification, record: null, issue: 'duplicate_records' };
  const record = matches[0];
  const v = validation.records[qualification];
  const subjects = (Array.isArray(record.subjects) ? record.subjects : []).map((s, index) => ({ index, s, r: resolveSubject(s) }));
  const errorFields = v.issues.filter((i) => i.severity === 'error').map((i) => i.field ?? '');
  return { qualification, record, validation: v, subjects, errorFields, complete: record.subjects_complete === true };
}

const evidenceOf = (ctx, fields, values = {}) => (ctx.record ? {
  qualification: ctx.qualification,
  recordId: ctx.record.id ?? null,
  documentId: ctx.record.document_id ?? null,
  fields,
  values,
  evidenceLevel: ctx.record.evidence_level ?? null,
  officialVerification: ctx.record.official_verification ?? null,
  origins: ctx.subjects.filter((x) => fields.includes(x.r.canonical)).map((x) => ({ subject: x.r.canonical, origin: x.s?.origin ?? null })),
} : { qualification: ctx.qualification, recordId: null, documentId: null, fields, values, evidenceLevel: null, officialVerification: null, origins: [] });

/** Validation errors on the record-level field or on any listed subject's entry. */
function errorsTouch(ctx, recordFields, subjects = []) {
  return ctx.errorFields.some((f) => {
    if (recordFields.includes(f)) return true;
    if (f === 'subjects') return subjects.length > 0;
    const m = /^subjects\[(\d+)\]/.exec(f);
    if (!m) return false;
    const entry = ctx.subjects[Number(m[1])];
    return subjects.length > 0 && (!entry?.r.canonical || subjects.includes(entry.r.canonical));
  });
}

/**
 * Presence of a subject: true | false | 'unknown'. Absent is only false when the list is
 * explicitly complete AND no ambiguous/unrecognised entry could be that subject.
 */
function presence(ctx, subject) {
  if (ctx.subjects.some((x) => x.r.canonical === subject)) return { value: true };
  const ambiguous = ctx.subjects.find((x) => x.r.status === 'ambiguous' && x.r.candidates.includes(subject));
  if (ambiguous) return { value: 'unknown', reason: 'ambiguous_subject', name: ambiguous.s?.name_raw ?? null };
  const unrecognised = ctx.subjects.find((x) => x.r.status === 'unknown');
  if (!ctx.complete) return { value: 'unknown', reason: 'subject_list_incomplete' };
  if (unrecognised) return { value: 'unknown', reason: 'unrecognised_subject', name: unrecognised.s?.name_raw ?? null };
  return { value: false };
}

// ---------------------------------------------------------------- requirements (achieved)
function result(req, status, reason, evidence, remedies = [], extra = {}) {
  const src = own(req._sources, req.source) ?? null;
  const sourceRef = { key: req.source, status: src?.status ?? 'unverified' };
  // Source safety: only an official source may produce a definitive failure.
  if (status === 'not_satisfied' && sourceRef.status !== 'official') {
    return { id: req.id, label: req.label, type: req.type, status: 'unknown', reason: 'source_not_official', indicative: 'not_satisfied', indicativeReason: reason, evidence, remedies: dedupe(remedies), source: sourceRef, ...extra };
  }
  return { id: req.id, label: req.label, type: req.type, status, reason, evidence, remedies: dedupe(remedies), source: sourceRef, ...extra };
}

const noRecord = (req, ctx, fields) => result(req, 'unknown', ctx.issue === 'duplicate_records' ? 'duplicate_records' : 'no_record', evidenceOf(ctx, fields),
  [ctx.issue === 'duplicate_records' ? { type: 'fix_record', qualification: ctx.qualification } : { type: 'add_record', qualification: ctx.qualification }]);

const presenceRemedy = (ctx, p) => (p.reason === 'ambiguous_subject' || p.reason === 'unrecognised_subject'
  ? { type: 'clarify_subject', qualification: ctx.qualification, name: p.name }
  : { type: 'confirm_subject_list', qualification: ctx.qualification });

/** Evaluate one requirement against achieved academic evidence. */
export function evaluateRequirement(requirement, ctx, sources = SOURCES) {
  const req = { ...requirement, _sources: sources };
  switch (req.type) {
    case 'qualification_passed': {
      if (!ctx.record) return noRecord(req, ctx, ['result_stated']);
      if (errorsTouch(ctx, ['result_stated', 'qualification'])) return result(req, 'unknown', 'record_has_errors', evidenceOf(ctx, ['result_stated']), [{ type: 'fix_record', qualification: ctx.qualification }]);
      const r = ctx.record.result_stated ?? null;
      const ev = evidenceOf(ctx, ['result_stated'], { result_stated: r });
      if (r === 'pass') return result(req, 'satisfied', 'passed', ev);
      if (r === 'fail') return result(req, 'not_satisfied', 'failed', ev);
      return result(req, 'unknown', r ? `result_${r}` : 'result_missing', ev, r ? [] : [{ type: 'complete_record', qualification: ctx.qualification, fields: ['result_stated'] }]);
    }

    case 'subjects_all':
    case 'subjects_any': {
      const subjects = req.params.subjects;
      if (!ctx.record) return noRecord(req, ctx, subjects);
      const p = subjects.map((s) => ({ subject: s, ...presence(ctx, s) }));
      const present = p.filter((x) => x.value === true).map((x) => x.subject);
      const ev = evidenceOf(ctx, subjects, { present });
      if (req.type === 'subjects_any' && present.length) return result(req, 'satisfied', 'subject_present', ev);
      if (errorsTouch(ctx, [], subjects)) return result(req, 'unknown', 'record_has_errors', ev, [{ type: 'fix_record', qualification: ctx.qualification }]);
      if (req.type === 'subjects_all') {
        const absent = p.filter((x) => x.value === false);
        if (absent.length) return result(req, 'not_satisfied', 'subject_absent', { ...ev, values: { present, absent: absent.map((x) => x.subject) } });
        const unknown = p.filter((x) => x.value === 'unknown');
        if (unknown.length) return result(req, 'unknown', unknown[0].reason, ev, unknown.map((x) => presenceRemedy(ctx, x)));
        return result(req, 'satisfied', 'subjects_present', ev);
      }
      const unknown = p.filter((x) => x.value === 'unknown');
      if (unknown.length) return result(req, 'unknown', unknown[0].reason, ev, unknown.map((x) => presenceRemedy(ctx, x)));
      return result(req, 'not_satisfied', 'subject_absent', ev);
    }

    case 'min_combined_percentage': {
      const { all, anyOf, min, relaxedMin } = req.params;
      const fields = [...all, ...anyOf];
      if (!ctx.record) return noRecord(req, ctx, fields);
      if (errorsTouch(ctx, [], fields)) return result(req, 'unknown', 'record_has_errors', evidenceOf(ctx, fields), [{ type: 'fix_record', qualification: ctx.qualification }]);
      const entry = (subject) => {
        const hits = ctx.subjects.filter((x) => x.r.canonical === subject);
        return hits.length === 1 ? hits[0].s : null;
      };
      const marked = (s) => s && subjectPercentage(s) != null;
      // Required subjects must each have usable marks.
      const missingMarks = all.filter((s) => !marked(entry(s)));
      const gradeOnly = ctx.subjects.length > 0 && ctx.subjects.every((x) => !isNum(x.s?.obtained)) && ctx.subjects.some((x) => x.s?.grade != null);
      if (missingMarks.length) {
        const reason = gradeOnly ? 'grade_only' : missingMarks.some((s) => entry(s) && isNum(entry(s).obtained) && entry(s).max == null) ? 'max_marks_missing' : 'marks_missing';
        return result(req, 'unknown', reason, evidenceOf(ctx, fields), [{ type: 'complete_record', qualification: ctx.qualification, fields: missingMarks }]);
      }
      // One combination per third subject that has usable marks.
      const base = all.map(entry);
      const combos = anyOf.filter((t) => marked(entry(t))).map((t) => {
        const set = [...base, entry(t)];
        // Thresholds are compared on the exact value; `percentage` is rounded for display only.
        const exact = (set.reduce((a, s) => a + s.obtained, 0) / set.reduce((a, s) => a + s.max, 0)) * 100;
        return { third: t, percentage: Math.round(exact * 100) / 100, exact };
      }).sort((a, b) => b.exact - a.exact || a.third.localeCompare(b.third));
      const best = combos[0] ?? null;
      const ev = evidenceOf(ctx, best ? [...all, best.third] : fields, { best, combinations: combos, min, relaxedMin });
      if (best && best.exact >= min) return result(req, 'satisfied', 'meets_minimum', ev);
      if (best && best.exact >= relaxedMin) return result(req, 'unknown', 'relaxation_band', ev);
      // A higher-scoring third subject could still exist unless every option is accounted for.
      const unmarkedThird = anyOf.some((t) => entry(t) && !marked(entry(t)));
      const openThird = anyOf.some((t) => presence(ctx, t).value === 'unknown');
      if (!best || unmarkedThird || openThird) {
        return result(req, 'unknown', best ? 'other_combinations_possible' : 'no_third_subject_marks', ev,
          !best ? [{ type: 'complete_record', qualification: ctx.qualification, fields: ['third subject marks'] }] : !ctx.complete ? [{ type: 'confirm_subject_list', qualification: ctx.qualification }] : []);
      }
      return result(req, 'not_satisfied', 'below_minimum', ev);
    }

    case 'institution_specific':
      return result(req, 'unknown', 'institution_specific', evidenceOf(ctx, []), [{ type: 'check_institution', note: req.params.note }]);

    default:
      return result(req, 'unknown', 'unsupported_requirement', evidenceOf(ctx, []));
  }
}

// ---------------------------------------------------------------- requirements (prospective)
/** Evaluate one requirement for a student who has not yet completed the qualification. */
export function evaluateProspectiveRequirement(req, stream, sources = SOURCES) {
  const sourceRef = { key: req.source, status: own(sources, req.source)?.status ?? 'unverified' };
  const out = (status, reason, remedies = [], evidence = {}) => ({ id: req.id, label: req.label, type: req.type, status, reason, evidence: { stream: stream ?? null, ...evidence }, remedies, source: sourceRef });
  switch (req.type) {
    case 'qualification_passed':
    case 'min_combined_percentage':
      return out('future', 'not_yet_evaluable');
    case 'subjects_all':
    case 'subjects_any': {
      const implied = own(STREAM_SUBJECTS, stream);
      const subjects = req.params.subjects;
      if (!implied) {
        // Undecided / commerce / humanities: the subject combination cannot be established.
        const take = req.type === 'subjects_all' ? subjects : [];
        return out('unknown', stream ? 'stream_subjects_not_established' : 'stream_unknown', take.map((s) => ({ type: 'take_subject', subject: s, label: subjectLabel(s) })));
      }
      if (req.type === 'subjects_any') {
        return subjects.some((s) => implied.includes(s)) ? out('open', 'stream_includes_subject', [], { implied }) : out('unknown', 'stream_subjects_not_established', [], { implied });
      }
      const missing = subjects.filter((s) => !implied.includes(s));
      return missing.length
        ? out('needs_subject', 'stream_lacks_subject', missing.map((s) => ({ type: 'take_subject', subject: s, label: subjectLabel(s) })), { implied, missing })
        : out('open', 'stream_includes_subjects', [], { implied });
    }
    case 'institution_specific':
      return out('unknown', 'institution_specific', [{ type: 'check_institution', note: req.params.note }]);
    default:
      return out('unknown', 'unsupported_requirement');
  }
}

// ---------------------------------------------------------------- routes
function routeShell(route, catalog) {
  const keys = [...new Set(route.requirements.map((q) => q.source))];
  return {
    routeId: route.id,
    label: route.label,
    steps: route.steps.map((s) => ({ ...s })),
    source: keys.map((k) => ({ key: k, ...own(catalog.sources, k) })),
    assumptions: [...route.assumptions],
    catalogVersion: catalog.version,
  };
}

const stepRemedies = (route) => route.steps.filter((s) => s.kind === 'entrance').map((s) => ({ type: 'prepare_entrance', label: s.label }));

/** Achieved-mode route result. */
export function evaluateRoute(route, ctx, catalog = DEFAULT_CATALOG) {
  const requirements = route.requirements.map((q) => evaluateRequirement(q, ctx, catalog.sources));
  const blocking = requirements.filter((r) => r.status === 'not_satisfied').map((r) => r.id);
  const unknown = requirements.filter((r) => r.status === 'unknown').map((r) => r.id);
  const status = blocking.length ? 'not_eligible' : unknown.length ? 'unknown' : 'eligible';
  const evidenceLevel = ctx.record ? weakestEvidence([ctx.record.evidence_level]) : null;
  const remedies = requirements.flatMap((r) => r.remedies);
  if (status === 'not_eligible' && evidenceLevel === 'self_reported') remedies.push({ type: 'verify_record', qualification: ctx.qualification });
  if (status !== 'not_eligible') remedies.push(...stepRemedies(route));
  return {
    ...routeShell(route, catalog),
    status,
    requirements,
    blocking,
    unknown,
    evidenceLevel,
    officiallyVerified: ctx.record?.official_verification === 'officially_verified',
    remedies: dedupe(remedies),
  };
}

/** Prospective-mode route result: open | needs_subject | unknown. */
export function evaluateProspectiveRoute(route, stream, catalog = DEFAULT_CATALOG) {
  const requirements = route.requirements.map((q) => evaluateProspectiveRequirement(q, stream, catalog.sources));
  const blocking = requirements.filter((r) => r.status === 'needs_subject').map((r) => r.id);
  const unknown = requirements.filter((r) => r.status === 'unknown').map((r) => r.id);
  const status = blocking.length ? 'needs_subject' : unknown.length ? 'unknown' : 'open';
  return {
    ...routeShell(route, catalog),
    status,
    requirements,
    blocking,
    unknown,
    evidenceLevel: null,          // based on the planned stream, not on academic evidence
    officiallyVerified: false,
    remedies: dedupe([...requirements.flatMap((r) => r.remedies), ...stepRemedies(route)]),
  };
}

// ---------------------------------------------------------------- careers
/** Qualifications a school_12 student is expected to have but has not recorded yet. */
export function pendingQualifications(profile, academicRecords) {
  const stage = userContext(profile).stage;
  return stage === 'school_12' && !asList(academicRecords).some((r) => r?.qualification === 'class_12') ? ['class_12'] : [];
}

/** 'prospective' for school_10/11, and school_12 without a Class 12 record; else 'achieved'. */
export function eligibilityMode(profile, academicRecords) {
  const stage = userContext(profile).stage;
  if (PROSPECTIVE_STAGES.includes(stage)) return 'prospective';
  if (pendingQualifications(profile, academicRecords).length) return 'prospective';
  return 'achieved';
}

/**
 * Career-level eligibility from its routes.
 *   achieved:    eligible | not_eligible | unknown | no_catalogued_route
 *   prospective: open | needs_subject | unknown | no_catalogued_route
 */
export function evaluateCareerEligibility({ careerId, academicRecords = [], profile = {}, catalog = DEFAULT_CATALOG, currentYear } = {}) {
  const mode = eligibilityMode(profile, academicRecords);
  const routeIds = [...new Set(asList(own(catalog.careerEntry, careerId)?.routes))].filter((id) => own(catalog.routes, id));
  const base = { careerId, mode, catalogVersion: catalog.version };
  if (!routeIds.length) return { ...base, status: 'no_catalogued_route', routes: [], viableRoutes: [], evidenceLevel: null };

  let routes;
  if (mode === 'prospective') {
    const stream = profile?.school_stream ?? null;
    routes = routeIds.map((id) => evaluateProspectiveRoute(own(catalog.routes, id), stream, catalog));
  } else {
    const records = asList(academicRecords);
    const validation = validateAcademicRecords(records, currentYear != null ? { currentYear } : {});
    const ctxs = {};
    const ctxFor = (q) => (ctxs[q] ??= recordContext(q, records, validation));
    routes = routeIds.map((id) => evaluateRoute(own(catalog.routes, id), ctxFor(own(catalog.routes, id).qualification), catalog));
  }

  // A closed or uncertain route points at the career's other routes (data-driven, never AI).
  const open = mode === 'prospective' ? ['open'] : ['eligible'];
  routes = routes.map((r) => {
    const others = routes.filter((o) => o.routeId !== r.routeId && o.status !== 'not_eligible').map((o) => o.routeId);
    return !open.includes(r.status) && others.length ? { ...r, remedies: dedupe([...r.remedies, { type: 'compare_routes', routes: others }]) } : r;
  });

  const statuses = routes.map((r) => r.status);
  const status = mode === 'prospective'
    ? (statuses.includes('open') ? 'open' : statuses.includes('unknown') ? 'unknown' : 'needs_subject')
    : (statuses.includes('eligible') ? 'eligible' : statuses.every((s) => s === 'not_eligible') ? 'not_eligible' : 'unknown');

  return {
    ...base,
    status,
    routes,
    viableRoutes: routes.filter((r) => r.status !== 'not_eligible').map((r) => r.routeId),
    evidenceLevel: weakestEvidence(routes.map((r) => r.evidenceLevel)),
  };
}

// ---------------------------------------------------------------- decision boundary
const REMEDY_KEYS = ['type', 'qualification', 'subject', 'label', 'routes'];

/**
 * The minimum the Decision Engine needs from a career result: statuses, reasons, remedy types
 * and evidence levels. Marks, percentages, subject lists and record ids are left out, so they
 * cannot reach decision text or AI prompts.
 */
export function summariseForDecision(result) {
  return {
    careerId: result.careerId,
    mode: result.mode,
    status: result.status,
    viableRoutes: [...result.viableRoutes],
    evidenceLevel: result.evidenceLevel,
    routes: result.routes.map((r) => ({
      routeId: r.routeId,
      label: r.label,
      status: r.status,
      blocking: [...r.blocking],
      unknown: [...r.unknown],
      evidenceLevel: r.evidenceLevel,
      officiallyVerified: r.officiallyVerified,
      requirements: r.requirements.map((q) => ({ id: q.id, status: q.status, reason: q.reason, ...(q.indicative ? { indicative: q.indicative } : {}) })),
      remedies: r.remedies.map((m) => Object.fromEntries(REMEDY_KEYS.filter((k) => k in m).map((k) => [k, Array.isArray(m[k]) ? [...m[k]] : m[k]]))),
    })),
  };
}
