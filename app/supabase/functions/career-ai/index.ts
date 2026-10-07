// career-ai: Praxio's AI gateway — the only code that talks to AI providers. API keys
// live in Supabase function secrets and never reach the browser.
//
// Deployed with JWT verification on (Supabase default), so only signed-in users can call it.
//   POST { mode: 'explain', context }                -> { explanations: { [domainId]: {...} }, model }   (Gemini)
//   POST { mode: 'chat', context, history, message } -> { reply, model }                                 (Gemini)
//   POST { mode: 'project', context }                -> { customisation, model }                          (Gemini)
//   POST { mode: 'evaluate', context }               -> { evaluation, model }                             (Gemini)
//   POST { mode: 'market_research', context }        -> { research }                                      (Groq)
//     on failure: 503/502 { error: 'Market intelligence temporarily unavailable.', code }
//
// `context` is built client-side by src/lib/ai.js from the student's own saved profile
// and scored shortlist (see buildContext there).

import { checkMode, requireUser } from './gateway.js';
import { MARKET_CONFIG, MarketResearchError, UNAVAILABLE_MESSAGE, researchMarket } from './market.js';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? MARKET_CONFIG.model;
const MAX_BODY_BYTES = 256 * 1024;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// Comma-separated, tried in order. Override with `supabase secrets set GEMINI_MODELS=...`.
const MODELS = (Deno.env.get('GEMINI_MODELS') ?? 'gemini-flash-latest,gemini-2.5-flash')
  .split(',').map((m) => m.trim()).filter(Boolean);

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

const CHAT_SYSTEM = (ctx: Context) => `You are the career advisor inside a career-discovery app for engineering students.
The student has completed a profile and received the recommendations below. Help them understand and explore these options: why a domain fits, how domains compare, what a pathway looks like, what to try next.

${profileBlock(ctx)}

Guidelines:
- Base personal claims only on the data above. If something isn't in the data, say so or ask.
- Explain scores honestly: they come from a weighted model of the student's own answers, not a prediction of success.
- If asked about a domain not on the list, discuss it openly and relate it to their answers.
- Keep answers focused and practical. Use short Markdown: bold labels, bullets, numbered steps for plans.
- Do not frame this as preparing for job interviews or recruitment drives; the goal is choosing a direction.`;

async function callGemini(body: Record<string, unknown>) {
  let lastErr = 'no models configured';
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
      if (text) return { text, model };
      lastErr = `${model}: empty response (${data.candidates?.[0]?.finishReason ?? 'unknown'})`;
    } else {
      lastErr = `${model}: HTTP ${res.status} ${await res.text()}`;
    }
    console.warn('Gemini attempt failed', lastErr);
  }
  throw new Error(lastErr);
}

async function explain(ctx: Context) {
  const ids = ctx.shortlist.map((r) => r.id);
  const { text, model } = await callGemini({
    systemInstruction: { parts: [{ text: EXPLAIN_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: `${profileBlock(ctx)}\n\nWrite one explanation per recommended domain.` }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            domain_id: { type: 'STRING', enum: ids },
            why: { type: 'STRING' },
            watch_out: { type: 'STRING' },
            grounded_on: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['domain_id', 'why', 'watch_out', 'grounded_on'],
        },
      },
    },
  });

  // Keep only explanations for requested domains, and only citations of real drivers.
  const explanations: Record<string, unknown> = {};
  for (const item of JSON.parse(text)) {
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
  const contents = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];
  const { text, model } = await callGemini({
    systemInstruction: { parts: [{ text: CHAT_SYSTEM(ctx) }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });
  return { reply: text, model };
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
  const { text, model } = await callGemini({
    systemInstruction: { parts: [{ text: PROJECT_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(ctx) }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          scenario: { type: 'STRING' },
          dataset_suggestion: { type: 'STRING' },
          extension_challenge: { type: 'STRING' },
        },
        required: ['title', 'scenario'],
      },
    },
  });
  return { customisation: JSON.parse(text), model };
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
  const { text, model } = await callGemini({
    systemInstruction: { parts: [{ text: EVAL_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ ...ctx, evidence: { ...ctx.evidence, readme: (ctx.evidence.readme ?? '').slice(0, 8000) } }) }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1536,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          concept_application: { type: 'INTEGER' },
          correctness: { type: 'INTEGER' },
          understanding: { type: 'INTEGER' },
          practical_application: { type: 'INTEGER' },
          strengths: { type: 'ARRAY', items: { type: 'STRING' } },
          improvements: { type: 'ARRAY', items: { type: 'STRING' } },
          demonstrated_skills: { type: 'ARRAY', items: { type: 'STRING', enum: ctx.challenge.skills } },
          feedback: { type: 'STRING' },
        },
        required: ['concept_application', 'correctness', 'understanding', 'practical_application', 'strengths', 'improvements', 'demonstrated_skills'],
      },
    },
  });
  return { evaluation: JSON.parse(text), model };
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
    const blocked = checkMode(mode, { GEMINI_API_KEY, GROQ_API_KEY });
    if (blocked) return json(blocked.body, blocked.status);

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
    return json({ error: 'AI request failed', detail: String(e?.message ?? e) }, 502);
  }
});
