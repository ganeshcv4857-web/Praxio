// career-ai: Praxio's AI gateway — the only code that talks to AI providers. API keys
// live in Supabase function secrets and never reach the browser.
//
// Deployed with JWT verification on (Supabase default), so only signed-in users can call it.
//   POST { mode: 'explain', context }                -> { explanations: { [domainId]: {...} }, model }   (Groq)
//   POST { mode: 'chat', context, history, message } -> { reply, model }                                 (Groq)
//   POST { mode: 'project', context }                -> { customisation, model }                          (Groq)
//   POST { mode: 'evaluate', context }               -> { evaluation, model }                             (Groq)
//   POST { mode: 'market_research', context }        -> { research }                                      (Groq)
//   POST { mode: 'alignment', context }              -> { narrative, model }   explanations only, no scores (Groq)
//     on failure: 503/502 { error: 'Market intelligence temporarily unavailable.', code }
//
// `context` is built client-side by src/lib/ai.js from the student's own saved profile
// and scored shortlist (see buildContext there).

import { checkMode, requireUser } from './gateway.js';
import { MARKET_CONFIG, MarketResearchError, UNAVAILABLE_MESSAGE, groqJson, researchMarket } from './market.js';
import { advisorReply } from './advisor.js';
import { ALIGNMENT_SYSTEM, narrativeSchema, validateNarrative } from './alignment.js';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? MARKET_CONFIG.model;
const MAX_BODY_BYTES = 256 * 1024;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Driver = { feature: string; label: string; value: number; weight: number };
type Rec = { id: string; name: string; summary: string; score: number; coverage: number; strengths: Driver[]; gaps: Driver[] };
type Context = {
  student: { name?: string; branch?: string; year?: number };
  answers: { label: string; value: number }[];   // every answered feature, 0..100
  shortlist: Rec[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function profileBlock(ctx: Context) {
  const s = ctx.student;
  const answers = ctx.answers.map((a) => `- ${a.label}: ${a.value}/100`).join('\n');
  const recs = ctx.shortlist.map((r, i) =>
    `${i + 1}. ${r.name} [id=${r.id}] — suitability ${r.score}/100 (answer coverage ${Math.round(r.coverage * 100)}%)\n` +
    `   strongest drivers: ${r.strengths.map((d) => `${d.label} (${d.value})`).join('; ') || 'none'}\n` +
    `   biggest gaps: ${r.gaps.map((d) => `${d.label} (${d.value})`).join('; ') || 'none'}`
  ).join('\n');
  return `STUDENT
Name: ${s.name || 'not given'}
Engineering branch: ${s.branch || 'not given'}
Year of study: ${s.year ?? 'not given'}

PROFILE ANSWERS (0 = low, 100 = high; only what the student actually answered)
${answers || '- none'}

RECOMMENDED CAREER DOMAINS (scored by a weighted model over the answers above)
${recs}`;
}

const EXPLAIN_SYSTEM = `You explain career-domain recommendations to an engineering student.
Rules:
- Ground every claim in the PROFILE ANSWERS and drivers provided. Refer to the student's specific answers (e.g. "you rated hands-on work highly"), never to generic traits of "people like you".
- Do not invent facts about the student. If coverage is low, say the match is tentative.
- Speak directly to the student ("you"), warmly but plainly. No hype, no emojis.
- "why": 2–3 sentences on why this domain fits, citing the strongest drivers.
- "watch_out": 1 sentence on the most relevant gap and what would close it. If no meaningful gap, give one honest consideration about the field instead.
- "grounded_on": the feature ids (from the drivers) your explanation relies on.`;

const CHAT_SYSTEM = (ctx: Context) => `You are the Praxio advisor for engineering students.
The student has completed a profile and received the career recommendations below. Help them understand and explore these options (why a domain fits, how domains compare, what a pathway looks like, what to try next), and also help with technical and programming questions, learning and study plans, projects, and planning or strategy for their studies and career.

${profileBlock(ctx)}

Guidelines:
- Base personal claims only on the data above. If something isn't in the data, say so or ask.
- For technical questions, give correct, practical help (explanations, alternatives, code snippets in fenced blocks) and relate it to their goals where it helps.
- Explain scores honestly: they come from a weighted model of the student's own answers, not a prediction of success.
- If asked about a domain not on the list, discuss it openly and relate it to their answers.
- Keep answers focused and practical. Use short Markdown: bold labels, bullets, numbered steps for plans.
- Do not frame this as preparing for job interviews or recruitment drives; the goal is choosing a direction.`;

const str = { type: 'string' };
const strArr = { type: 'array', items: { type: 'string' } };

async function explain(ctx: Context) {
  const ids = ctx.shortlist.map((r) => r.id);
  const { data, model } = await groqJson({
    apiKey: GROQ_API_KEY,
    model: GROQ_MODEL,
    name: 'career_explanations',
    system: EXPLAIN_SYSTEM,
    user: `${profileBlock(ctx)}\n\nWrite one explanation per recommended domain.`,
    temperature: 0.4,
    schema: {
      type: 'object', additionalProperties: false, required: ['explanations'],
      properties: {
        explanations: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['domain_id', 'why', 'watch_out', 'grounded_on'],
            properties: { domain_id: { type: 'string', enum: ids }, why: str, watch_out: str, grounded_on: strArr },
          },
        },
      },
    },
  });

  // Keep only explanations for requested domains, and only citations of real drivers.
  const explanations: Record<string, unknown> = {};
  for (const item of Array.isArray(data?.explanations) ? data.explanations : []) {
    const rec = ctx.shortlist.find((r) => r.id === item.domain_id);
    if (!rec) continue;
    const valid = new Set([...rec.strengths, ...rec.gaps].map((d) => d.feature));
    explanations[rec.id] = {
      why: String(item.why),
      watch_out: String(item.watch_out),
      grounded_on: (item.grounded_on ?? []).filter((f: string) => valid.has(f)),
    };
  }
  return { explanations, model };
}

async function chat(ctx: Context, history: { role: string; content: string }[], message: string) {
  // Guarded: off-topic messages get a polite refusal and never reach the main model.
  return advisorReply({ apiKey: GROQ_API_KEY, model: GROQ_MODEL, system: CHAT_SYSTEM(ctx), history, message });
}

// ---------------------------------------------------------------------------
// Module 3: project customisation and evaluation.
// The app owns requirements, the weighted total, pass/fail, skills and points;
// these modes only propose wording (project) or per-criterion scores (evaluate).
// ---------------------------------------------------------------------------

type ProjectCtx = {
  career: string; course: string; module: string; skills: string[]; difficulty: string;
  template: { title: string; brief: string; requirements: string[] };
};

const PROJECT_SYSTEM = `You tailor a practical coding/engineering project for an engineering student who just completed a course module.
Rules:
- The project MUST require applying the module's concept and skills. Do not change the topic.
- Keep the template's requirements achievable; you only rewrite the title and scenario to feel concrete and relevant to the career, and suggest a freely available dataset or resource and one optional extension.
- Match the difficulty level. Indian college context is welcome. No hype, no emojis.`;

async function customiseProject(ctx: ProjectCtx) {
  const { data, model } = await groqJson({
    apiKey: GROQ_API_KEY,
    model: GROQ_MODEL,
    name: 'project_customisation',
    system: PROJECT_SYSTEM,
    user: JSON.stringify(ctx),
    temperature: 0.6,
    maxTokens: 1024,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['title', 'scenario', 'dataset_suggestion', 'extension_challenge'],
      properties: { title: str, scenario: str, dataset_suggestion: str, extension_challenge: str },
    },
  });
  return { customisation: data, model };
}

type EvalCtx = {
  challenge: { title: string; description: string; requirements: string[]; skills: string[]; difficulty: string; module: string };
  submission: { github_url: string; demo_url?: string; explanation?: string };
  evidence: { readme?: string; repo?: Record<string, unknown> };
};

const EVAL_SYSTEM = `You assess whether an engineering student demonstrated a concept in a practical project.
Score each criterion 0-100 using ONLY the evidence given (requirements, README, repository metadata, the student's explanation). Do not assume features that are not evidenced.
- concept_application: did the project actually apply the module's concept?
- correctness: does the evidence indicate a working, correct implementation?
- understanding: does the student show they understand what they built?
- practical_application: is the concept used meaningfully in a practical context?
If evidence is thin (e.g. no README), score conservatively and say what is missing.
strengths and improvements: 2-4 short, specific, encouraging items each, citing the evidence.
demonstrated_skills: only skills from the provided list that the evidence clearly shows.`;

async function evaluateProject(ctx: EvalCtx) {
  const { data, model } = await groqJson({
    apiKey: GROQ_API_KEY,
    model: GROQ_MODEL,
    name: 'project_evaluation',
    system: EVAL_SYSTEM,
    user: JSON.stringify({ ...ctx, evidence: { ...ctx.evidence, readme: (ctx.evidence.readme ?? '').slice(0, 8000) } }),
    temperature: 0.2,
    maxTokens: 1536,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['concept_application', 'correctness', 'understanding', 'practical_application', 'strengths', 'improvements', 'demonstrated_skills', 'feedback'],
      properties: {
        concept_application: { type: 'integer' },
        correctness: { type: 'integer' },
        understanding: { type: 'integer' },
        practical_application: { type: 'integer' },
        strengths: strArr,
        improvements: strArr,
        demonstrated_skills: { type: 'array', items: { type: 'string', enum: ctx.challenge.skills } },
        feedback: str,
      },
    },
  });
  // Scores are only proposals: the client validates them and computes total/pass/skills/points.
  return { evaluation: data, model };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'request too large' }, 413);

  // Only signed-in Praxio users (not the public publishable/anon key) may use the gateway.
  const userId = await requireUser(req.headers.get('Authorization'), {
    supabaseUrl: SUPABASE_URL,
    apiKey: SUPABASE_ANON_KEY || req.headers.get('apikey') || '',
  });
  if (!userId) return json({ error: 'Sign in required' }, 401);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'request too large' }, 413);
    const { mode, context, history = [], message } = JSON.parse(raw);

    // Each mode needs only its own provider's key.
    const blocked = checkMode(mode, { GROQ_API_KEY });
    if (blocked) return json(blocked.body, blocked.status);

    if (mode === 'alignment') {
      if (!context?.career || !Array.isArray(context?.paths) || !context.paths.length || !Array.isArray(context?.differences)) {
        return json({ error: 'alignment context is required' }, 400);
      }
      const { data, model } = await groqJson({
        apiKey: GROQ_API_KEY, model: GROQ_MODEL, name: 'alignment_narrative',
        system: ALIGNMENT_SYSTEM, user: JSON.stringify(context), schema: narrativeSchema(context),
        temperature: 0.5, maxTokens: 2048,
      });
      return json({ narrative: validateNarrative(data, context), model });
    }

    if (mode === 'market_research') {
      try {
        return json({ research: await researchMarket(context, { apiKey: GROQ_API_KEY, model: GROQ_MODEL }) });
      } catch (e) {
        // Log only the failure class — never the key, prompt or student context.
        const code = e instanceof MarketResearchError ? e.code : 'internal';
        console.warn('market_research failed:', code, e instanceof MarketResearchError ? e.detail : '');
        const status = code === 'bad_request' ? 400 : code === 'not_configured' ? 503 : 502;
        // Short diagnostic only (e.g. 'Groq HTTP 400: …'); no key, prompt or student data.
        const detail = e instanceof MarketResearchError && code !== 'bad_request' ? String(e.detail ?? '').slice(0, 240) : undefined;
        return json({ error: UNAVAILABLE_MESSAGE, code, detail }, status);
      }
    }

    if (mode === 'project') {
      if (!context?.template?.requirements?.length) return json({ error: 'context.template is required' }, 400);
      return json(await customiseProject(context));
    }
    if (mode === 'evaluate') {
      if (!context?.challenge?.skills?.length || !context?.submission?.github_url) return json({ error: 'challenge and submission are required' }, 400);
      return json(await evaluateProject(context));
    }
    if (!context?.shortlist?.length) return json({ error: 'context.shortlist is required' }, 400);
    if (mode === 'explain') return json(await explain(context));
    if (mode === 'chat') {
      if (!message || typeof message !== 'string') return json({ error: 'message is required' }, 400);
      return json(await chat(context, history, message.slice(0, 4000)));
    }
    return json({ error: `unknown mode: ${mode}` }, 400);
  } catch (e) {
    console.error(e);
    // MarketResearchError carries a safe diagnostic in .detail (its message is the market text).
    return json({ error: 'AI request failed', detail: String(e?.detail ?? e?.message ?? e).slice(0, 240) }, 502);
  }
});
