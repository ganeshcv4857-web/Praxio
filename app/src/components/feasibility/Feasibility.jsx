import { useMemo, useState } from 'react';
import { evaluateAll, isComplete } from '../../lib/feasibility/scoring.js';
import FeasibilityWizard, { pickInputs } from './FeasibilityWizard.jsx';
import FeasibilityDashboard from './FeasibilityDashboard.jsx';

// Module 2 entry: shows the input wizard until answers exist, then the dashboard.
// Results are recalculated from the stored inputs and current Module 1 shortlist on
// every render, so they always reflect the latest recommendations.
export default function Feasibility({ row, recs, stage, onSave, onOpenCareer, onPlanLearning }) {
  const inputs = pickInputs(row);
  const complete = isComplete(inputs);
  const [editing, setEditing] = useState(!complete);
  const results = useMemo(() => evaluateAll(inputs, recs), [row, recs]); // eslint-disable-line react-hooks/exhaustive-deps

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
