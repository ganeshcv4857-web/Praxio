import { APTITUDES, BRANCHES, FEATURE_LABELS, INTERESTS, PREFERENCES, TRAITS, buildFeatures } from '../lib/features.js';
import ScoreBar from './ScoreBar.jsx';

function Group({ title, keys, features }) {
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="space-y-2">
        {keys.filter((k) => features[k] != null).map((k) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between gap-3 text-slate-300">
              <span>{FEATURE_LABELS[k].replace(/^\w+: /, '')}</span>
              <span className="tabular-nums text-slate-500">{features[k]}</span>
            </div>
            <ScoreBar value={features[k]} className="mt-1 h-1.5" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ProfileTab({ profile, onEdit }) {
  const f = buildFeatures(profile);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.full_name}</h1>
          <p className="text-sm text-slate-400">
            {BRANCHES.find((b) => b.id === profile.branch)?.label} · Year {profile.year_of_study}
          </p>
        </div>
        <button className="btn-primary" onClick={onEdit}>Update answers &amp; rescore</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Group title="Interests" keys={INTERESTS.map((i) => i.key)} features={f} />
        <div className="space-y-4">
          <Group title="Aptitude (self-rating blended with quick check)" keys={APTITUDES.map((i) => i.key)} features={f} />
          <Group title="Personal characteristics" keys={TRAITS.map((i) => i.key)} features={f} />
        </div>
      </div>
      <section className="card">
        <h2 className="mb-3 font-semibold">Preferences</h2>
        <ul className="space-y-4">
          {PREFERENCES.map((p) => (
            <li key={p.key} className="text-sm">
              <div className="flex justify-between text-xs text-slate-400"><span>{p.left}</span>{f[p.key] == null && <span className="text-slate-500">Not answered</span>}<span>{p.right}</span></div>
              <div className="relative mt-2 h-1.5 rounded-full bg-slate-800">
                {f[p.key] != null && (
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400"
                    style={{ left: `${f[p.key]}%` }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
