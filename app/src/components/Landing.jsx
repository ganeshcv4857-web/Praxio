// Public landing page: what Praxio is, then sign up / log in (or enter the local demo).
const LOOP = ['Discover', 'Learn', 'Apply', 'Build', 'Prove', 'Improve'];

const PILLARS = [
  { title: 'Career fit', body: 'A short assessment of your interests, aptitude, preferences and personality ranks the engineering careers that suit you, and explains why.' },
  { title: 'Feasibility', body: "Checks each career against your family's budget, education plans, risk comfort and location, so the path is realistic, not just appealing." },
  { title: 'Development', body: 'A learning path built for your budget, practical projects for every module, and a record of the skills you have actually proven.' },
];

export default function Landing({ onSignUp, onLogIn, demo }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-xl font-extrabold tracking-tight">Praxio</span>
        {!demo && <button className="btn-ghost" onClick={onLogIn}>Log in</button>}
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">From praxis: theory, put into practice</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Find the career that fits you, and prove you can do it.
        </h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Praxio is a career-development system for engineering students. It connects who you are, what&rsquo;s
          realistic for your family, what you learn, and what you can demonstrate, in one continuous loop.
        </p>

        <ol className="mt-8 flex flex-wrap items-center gap-2 text-sm font-semibold">
          {LOOP.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-indigo-200">{step}</span>
              {i < LOOP.length - 1 && <span className="text-slate-600">→</span>}
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap gap-3">
          {demo ? (
            <button className="btn-primary px-5 py-2.5" onClick={onSignUp}>Enter the demo</button>
          ) : (
            <>
              <button className="btn-primary px-5 py-2.5" onClick={onSignUp}>Create a free account</button>
              <button className="btn-ghost px-5 py-2.5" onClick={onLogIn}>I already have an account</button>
            </>
          )}
        </div>
        {demo && (
          <p className="mt-3 text-xs text-amber-300">Demo mode: no Supabase configured, so data is kept only in this browser.</p>
        )}

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <section key={p.title} className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module {i + 1}</p>
              <h2 className="mt-1 font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{p.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
