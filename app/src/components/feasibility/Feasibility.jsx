import { useEffect, useMemo, useState } from 'react';
import * as db from '../../lib/db.js';
import { evaluateAll, isComplete } from '../../lib/feasibility/scoring.js';
import { evaluateCareerEligibility } from '../../lib/academic/eligibility.js';
import FeasibilityWizard, { pickInputs } from './FeasibilityWizard.jsx';
import FeasibilityDashboard from './FeasibilityDashboard.jsx';

// Module 2 entry: shows the input wizard until answers exist, then the dashboard.
// Results are recalculated from the stored inputs and current Module 1 shortlist on
// every render, so they always reflect the latest recommendations.
export default function Feasibility({ userId, profile, row, recs, stage, onSave, onOpenCareer, onPlanLearning }) {
  const inputs = pickInputs(row);
  const complete = isComplete(inputs);
  const [editing, setEditing] = useState(!complete);
  // Academic eligibility gates each career (closed → barrier). Without a readable record the
  // factor still shows as "unclear"; a failed read just leaves it out.
  const [academicRecords, setAcademicRecords] = useState(null);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    db.getAcademicEvidence(userId).then((ev) => live && setAcademicRecords(ev.records ?? [])).catch(() => {});
    return () => { live = false; };
  }, [userId]);
  const eligibilityById = useMemo(() => {
    if (!academicRecords) return null;
    const out = {};
    for (const r of recs) {
      try { out[r.domainId] = evaluateCareerEligibility({ careerId: r.domainId, academicRecords, profile }); } catch { /* leave out */ }
    }
    return out;
  }, [academicRecords, recs, profile]);
  const results = useMemo(() => evaluateAll(inputs, recs, eligibilityById), [row, recs, eligibilityById]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recs.length) return <p className="text-slate-400">Complete your assessment first to get career recommendations.</p>;

  if (editing || !complete) {
    return (
      <FeasibilityWizard
        initial={row}
        careerCount={recs.length}
        stage={stage}
        onCancel={complete ? () => setEditing(false) : null}
        onSubmit={async (form) => {
          await onSave(form);
          setEditing(false);
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  return (
    <FeasibilityDashboard
      inputs={inputs}
      results={results}
      recs={recs}
      onEdit={() => setEditing(true)}
      onOpenCareer={onOpenCareer}
      onPlanLearning={onPlanLearning}
    />
  );
}
