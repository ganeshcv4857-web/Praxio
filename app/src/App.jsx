import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isConfigured } from './lib/supabase.js';
import * as db from './lib/db.js';
import { DEMO_USER_ID, readDemoSnapshot, resetDemo } from './lib/demoDb.js';
import { onSessionExpired, resetSessionExpired } from './lib/session.js';
import { demoImportAvailable, importDemoProgress } from './lib/importLocal.js';
import { rankCareers, shortlist as toShortlist } from './lib/scoring.js';
import { buildContext, explainShortlist, fallbackExplanation, fromRow } from './lib/ai.js';
import Landing from './components/Landing.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import ResetPassword from './components/ResetPassword.jsx';
import Dashboard from './components/Dashboard.jsx';
import Onboarding from './components/Onboarding.jsx';
import Shell from './components/Shell.jsx';
import Results from './components/Results.jsx';
import CareerDetail from './components/CareerDetail.jsx';
import Advisor from './components/Advisor.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import Feasibility from './components/feasibility/Feasibility.jsx';
import Development from './components/development/Development.jsx';
import MarketIntelligence from './components/market/MarketIntelligence.jsx';
import Alignment from './components/alignment/Alignment.jsx';
import { evaluateAll } from './lib/feasibility/scoring.js';
import { pickInputs as pickFeasibilityInputs } from './components/feasibility/FeasibilityWizard.jsx';
import { FEASIBILITY_VERSION } from './lib/feasibility/config.js';
import { userContext } from './lib/userContext.js';

// Navigation (state-based, as before):
//   screen:    'loading' | 'landing' | 'auth' | 'reset_password' | 'assessment' | 'app'
//   activeTab: 'dashboard' | 'results' | 'career' | 'advisor' | 'profile' | 'feasibility' | 'development' | 'market' | 'alignment'
// Every in-app screen requires a session (or demo mode); the dashboard is the home.
// Without Supabase env vars the app runs in demo mode: no auth, browser storage, no AI.
export default function App() {
  const [screen, setScreen] = useState('loading');
  const [authTab, setAuthTab] = useState('login');
  const [authNotice, setAuthNotice] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [recs, setRecs] = useState([]);
  const [feasibility, setFeasibility] = useState(null); // Module 2 row (inputs + cached results)
  const [assessment, setAssessment] = useState(null); // in-progress Module 1 attempt, if any
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [advisorFocus, setAdvisorFocus] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [navCount, setNavCount] = useState(0); // bumps on sidebar clicks so sub-views reset to their start
  const [importState, setImportState] = useState('none'); // 'none' | 'offer' | 'busy' | 'done'
  const [error, setError] = useState('');
  const userLogout = useRef(false);

  useEffect(() => { window.scrollTo(0, 0); }, [activeTab, selectedDomain, screen]);

  const userId = isConfigured ? session?.user?.id : DEMO_USER_ID;

  // Generate grounded explanations for the shortlist (stored as generated outputs).
  const explain = useCallback(async (prof, list) => {
    setExplaining(true);
    try {
      const { explanations, model } = await explainShortlist(buildContext(prof, list));
      await db.saveExplanations(prof.id, list, explanations, model);
      setRecs((cur) => cur.map((r) => (explanations[r.domainId] ? { ...r, explanation: explanations[r.domainId] } : r)));
    } catch (e) {
      console.warn('Explanation generation failed; using score-based fallback.', e);
      setRecs((cur) => cur.map((r) => (r.explanation ? r : { ...r, explanation: fallbackExplanation(r) })));
    } finally {
      setExplaining(false);
    }
  }, []);

  /** Restore everything Praxio knows about this user, then land on the dashboard. */
  const loadUser = useCallback(async (uid) => {
    try {
      const prof = await db.getProfile(uid);
      setProfile(prof);
      const [rows, feas, attempt] = await Promise.all([
        db.getRecommendations(uid).then((r) => r.map(fromRow)),
        // Optional modules must never block the dashboard.
        db.getFeasibility(uid).catch((e) => { console.warn('Feasibility load failed', e); return null; }),
        db.getAssessmentSession(uid).catch((e) => { console.warn('Assessment session load failed', e); return null; }),
      ]);
      setRecs(rows);
      setFeasibility(feas);
      setAssessment(attempt);
      if (isConfigured && demoImportAvailable(prof)) setImportState('offer');
      setActiveTab('dashboard');
      setScreen('app');
      if (rows.length && rows.some((r) => !r.explanation)) explain(prof, rows);
    } catch (e) {
      setError(`Could not load your Praxio data: ${e.message}`);
      setScreen(isConfigured ? 'auth' : 'landing');
    }
  }, [explain]);

  const clearUser = () => {
    setProfile(null);
    setRecs([]);
    setFeasibility(null);
    setAssessment(null);
    setImportState('none');
  };

  useEffect(() => {
    if (!isConfigured) {
      // Demo: returning visitors go straight to their dashboard.
      if (readDemoSnapshot()) loadUser(DEMO_USER_ID);
      else setScreen('landing');
      return;
    }
    // Restores the persisted session on load (INITIAL_SESSION) and follows sign-in,
    // sign-out, token refresh failures and password recovery.
    let loadedFor; // undefined until the first auth event, so a signed-out first visit isn't skipped
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setScreen('reset_password');
        return;
      }
      const uid = s?.user?.id ?? null;
      if (uid === loadedFor) return;
      loadedFor = uid;
      if (uid) {
        resetSessionExpired();
        setError('');
        setScreen('loading');
        loadUser(uid);
      } else {
        clearUser();
        // Signed out without the user asking (e.g. refresh token revoked or expired).
        if (event === 'SIGNED_OUT' && !userLogout.current) {
          setAuthNotice((n) => n || 'Your session has ended. Please log in again.');
        }
        userLogout.current = false;
        setAuthTab('login');
        setScreen(event === 'INITIAL_SESSION' ? 'landing' : 'auth');
      }
    });
    // An API call rejected for an expired/invalid token: sign out locally and explain why.
    const offExpired = onSessionExpired(() => {
      setAuthNotice('Your session has expired. Please log in again.');
      supabase.auth.signOut({ scope: 'local' });
    });
    return () => {
      sub.subscription.unsubscribe();
      offExpired();
    };
  }, [loadUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Module 1: assessment (resumable) ---------------------------------
  const startAssessment = () => setScreen('assessment');

  const saveAssessmentProgress = async (step, draft, quiz) => {
    try {
      setAssessment(await db.saveAssessmentDraft(userId, assessment?.id ?? null, { current_step: step, draft, quiz_answers: quiz }));
    } catch (e) {
      console.warn('Could not save assessment progress', e);
    }
  };

  const completeOnboarding = async (answers, quiz) => {
    setError('');
    const prof = await db.saveProfile(userId, { ...answers, onboarded_at: new Date().toISOString() });
    setProfile(prof);
    await db.completeAssessmentSession(userId, assessment?.id ?? null, { draft: answers, quiz_answers: quiz ?? [], assessment_version: answers.assessment_version ?? null });
    setAssessment(null);
    const list = toShortlist(rankCareers(prof));
    const rows = (await db.replaceRecommendations(userId, list)).map(fromRow);
    setRecs(rows);
    // Keep Module 2's cached results in step with the new shortlist.
    if (feasibility) {
      setFeasibility(await db.saveFeasibility(userId, pickFeasibilityInputs(feasibility), evaluateAll(feasibility, rows), FEASIBILITY_VERSION));
    }
    setActiveTab('results');
    setScreen('app');
    explain(prof, rows);
  };

  const signOut = () => {
    if (isConfigured) {
      userLogout.current = true;
      setAuthNotice('You have been logged out.');
      return supabase.auth.signOut();
    }
    // Demo: "log out" wipes the local data so the flow can be tried again.
    resetDemo();
    clearUser();
    setScreen('landing');
  };

  const openCareer = (domainId) => {
    setSelectedDomain(domainId);
    setActiveTab('career');
  };

  const saveFeasibility = async (inputs) => {
    const results = evaluateAll(inputs, recs);
    setFeasibility(await db.saveFeasibility(userId, inputs, results, FEASIBILITY_VERSION));
  };

  const askAbout = (domainId) => {
    setAdvisorFocus(domainId);
    setActiveTab('advisor');
  };

  const runImport = async () => {
    setImportState('busy');
    try {
      await importDemoProgress(userId);
      setImportState('done');
      await loadUser(userId);
    } catch (e) {
      setError(`Import failed: ${e.message}`);
      setImportState('offer');
    }
  };

  // ---- Screens ------------------------------------------------------------
  if (screen === 'loading') return <div className="grid min-h-screen place-items-center text-slate-400">Loading Praxio…</div>;
  if (screen === 'landing') {
    return (
      <Landing
        demo={!isConfigured}
        onSignUp={() => (isConfigured ? (setAuthTab('signup'), setScreen('auth')) : loadUser(DEMO_USER_ID))}
        onLogIn={() => { setAuthTab('login'); setScreen('auth'); }}
      />
    );
  }
  if (screen === 'auth') {
    return (
      <AuthScreen
        key={authTab + authNotice}
        initialTab={authTab}
        initialError={error}
        initialNotice={authNotice}
        onBack={() => setScreen('landing')}
      />
    );
  }
  if (screen === 'reset_password') {
    return <ResetPassword onDone={() => { setAuthNotice(''); loadUser(session.user.id); }} />;
  }
  if (screen === 'assessment') {
    // Resume an unfinished attempt; otherwise start from the saved profile (retake) or blank.
    const initial = assessment ? { ...profile, ...assessment.draft } : profile;
    return (
      <Onboarding
        initial={initial}
        initialStep={assessment?.current_step ?? 0}
        initialQuiz={assessment?.quiz_answers}
        onProgress={saveAssessmentProgress}
        onComplete={completeOnboarding}
        onCancel={() => setScreen('app')}
      />
    );
  }

  const importOffer = importState === 'offer' || importState === 'busy' ? (
    <section className="card flex flex-wrap items-center justify-between gap-3 border-amber-500/30 bg-amber-500/5">
      <div className="max-w-xl text-sm">
        <p className="font-semibold">We found Praxio progress saved only in this browser</p>
        <p className="text-slate-400">
          Import your assessment answers, feasibility answers and learning progress into your account. Scores are
          recalculated; project evaluations and points from the browser are not imported.
        </p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={importState === 'busy'} onClick={() => setImportState('none')}>Not now</button>
        <button className="btn-primary" disabled={importState === 'busy'} onClick={runImport}>{importState === 'busy' ? 'Importing…' : 'Import'}</button>
      </div>
    </section>
  ) : null;

  const needsAssessment = !profile?.onboarded_at || recs.length === 0;
  const AssessmentFirst = () => (
    <div className="card mx-auto max-w-xl space-y-3 text-center">
      <h1 className="text-xl font-bold">Complete your assessment first</h1>
      <p className="text-sm text-slate-400">This section uses your career-fit results.</p>
      <button className="btn-primary" onClick={startAssessment}>{assessment ? 'Continue Assessment' : 'Start Assessment'}</button>
    </div>
  );

  return (
    <Shell
      activeTab={activeTab}
      setActiveTab={(tab) => { setActiveTab(tab); setNavCount((n) => n + 1); }}
      profile={profile}
      onSignOut={signOut}
    >
      {!isConfigured && <DemoBanner />}
      {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      {activeTab === 'dashboard' && (
        <Dashboard
          userId={userId}
          profile={profile}
          recs={recs}
          feasibilityRow={feasibility}
          assessmentSession={assessment}
          onStartAssessment={startAssessment}
          go={(tab) => { setActiveTab(tab); setNavCount((n) => n + 1); }}
          importOffer={importOffer}
        />
      )}
      {activeTab !== 'dashboard' && activeTab !== 'profile' && needsAssessment && <AssessmentFirst />}
      {!needsAssessment && activeTab === 'results' && (
        <Results
          recs={recs}
          profile={profile}
          explaining={explaining}
          onOpen={openCareer}
          onAsk={askAbout}
          hasFeasibility={Boolean(feasibility)}
          onCheckFeasibility={() => setActiveTab('feasibility')}
        />
      )}
      {!needsAssessment && activeTab === 'career' && (
        <CareerDetail
          rec={recs.find((r) => r.domainId === selectedDomain) ?? recs[0]}
          explaining={explaining}
          onBack={() => setActiveTab('results')}
          onAsk={askAbout}
        />
      )}
      {!needsAssessment && activeTab === 'advisor' && (
        <Advisor
          userId={userId}
          context={buildContext(profile, recs)}
          focusDomain={advisorFocus}
          clearFocus={() => setAdvisorFocus(null)}
        />
      )}
      {!needsAssessment && activeTab === 'feasibility' && (
        <Feasibility
          row={feasibility}
          recs={recs}
          stage={userContext(profile).stage}
          onSave={saveFeasibility}
          onOpenCareer={openCareer}
          onPlanLearning={() => setActiveTab('development')}
        />
      )}
      {!needsAssessment && activeTab === 'development' && (
        <Development
          key={navCount}
          userId={userId}
          recs={recs}
          feasibilityRow={feasibility}
          onGoFeasibility={() => setActiveTab('feasibility')}
        />
      )}
      {!needsAssessment && activeTab === 'market' && (
        <MarketIntelligence
          key={navCount}
          userId={userId}
          profile={profile}
          recs={recs}
          feasibilityRow={feasibility}
          onGoFeasibility={() => setActiveTab('feasibility')}
        />
      )}
      {!needsAssessment && activeTab === 'alignment' && (
        <Alignment
          key={navCount}
          userId={userId}
          profile={profile}
          recs={recs}
          feasibilityRow={feasibility}
          onGoFeasibility={() => setActiveTab('feasibility')}
        />
      )}
      {activeTab === 'profile' && (needsAssessment
        ? <AssessmentFirst />
        : <ProfileTab profile={profile} onEdit={startAssessment} />)}
    </Shell>
  );
}

function DemoBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
      Demo mode: no Supabase configured. Data stays in this browser and explanations come from the
      score breakdown instead of the AI. &ldquo;Log out&rdquo; resets the demo.
    </div>
  );
}
