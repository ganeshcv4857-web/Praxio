// Advisor scope guardrails (Groq). Plain JS: used by the gateway, unit-tested under Node.
//
// Layer 1: a small, fast classifier labels each message. Off-topic messages get a fixed
//          polite refusal and never reach the main model.
// Layer 2: the main advisor prompt carries the same scope rules, in case the classifier is
//          unavailable or a message slips through.

import { groq, groqChat, MARKET_CONFIG } from './market.js';

export const ADVISOR_CONFIG = {
  classifierModel: 'openai/gpt-oss-20b',
  classifierTimeoutMs: 15_000,
};

export const SCOPE_CATEGORIES = ['greeting', 'career', 'technical', 'learning', 'planning', 'off_topic'];

export const OFF_TOPIC_REPLY =
  "Sorry, that's out of context for me. I'm your Praxio advisor, so I can help with your career options, " +
  'studies and learning plans, technical and programming questions, projects, and planning your next steps. ' +
  'Ask me anything along those lines!';

/** Scope rules appended to the advisor's system prompt (second layer). */
export const SCOPE_RULES = `
Scope (strict):
- IN SCOPE: brief friendly small talk (greetings, thanks, how are you); careers, jobs, internships, higher studies and the student's recommendations; technical and programming help (code, debugging, algorithms, ML/data/AI tools and alternatives, electronics, engineering subjects); learning resources and study plans; project ideas and reviews; planning and strategy for studies, projects or career.
- OUT OF SCOPE: politics and elections (any country or state), political parties or leaders, current-affairs news, religion, celebrities and entertainment gossip, sports results, medical, legal or financial-investment advice, and anything unrelated to learning, technology or careers.
- For out-of-scope requests reply ONLY with: "${OFF_TOPIC_REPLY}"
- A topic that is normally out of scope is fine when asked as a career or technical question (e.g. "careers in public policy", "building an election-results dashboard in React").
- For small talk, reply in one or two friendly sentences and offer to help with their career or learning.`;

const GREETING_RE = /^(hi+|h?ello+|hey+|hii+|yo|namaste|vanakkam|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ty|ok(ay)?|cool|nice|great|bye|see you|how are you\??|who are you\??|what can you do\??)[\s!.?]*$/i;

/** Obvious small talk skips the classifier entirely. */
export const isPlainGreeting = (message) => GREETING_RE.test(String(message ?? '').trim());

const CLASSIFIER_SYSTEM = `You classify a student's latest message to a career-and-learning advisor for engineering students.
Categories:
- greeting: small talk, greetings, thanks, asking what the assistant can do
- career: careers, jobs, internships, salaries, higher studies, the student's career recommendations
- technical: programming, debugging, algorithms, ML/AI/data tools and their alternatives, electronics, engineering or science concepts
- learning: courses, study plans, resources, exams, how to learn a topic
- planning: strategy or plans for studies, projects, portfolio, time management, career steps
- off_topic: anything else (politics, elections, political parties or leaders, news, religion, celebrities, entertainment, sports results, medical/legal/investment advice, general trivia unrelated to learning or careers)
Judge the latest message in the context of the recent conversation (follow-ups like "what about the second one?" inherit the earlier topic).
A normally off-topic subject asked as a career or technical question (e.g. "careers in journalism", "scrape election data with Python") is NOT off_topic.`;

const CLASSIFIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category'],
  properties: { category: { type: 'string', enum: SCOPE_CATEGORIES } },
};

/**
 * Classify a message. Returns one of SCOPE_CATEGORIES, or null if the classifier failed
 * (callers then rely on the prompt-level rules instead of blocking the student).
 */
export async function classifyMessage({ apiKey, message, history = [], fetchImpl = fetch }) {
  if (isPlainGreeting(message)) return 'greeting';
  const recent = history.slice(-4).map((m) => `${m.role === 'user' ? 'Student' : 'Advisor'}: ${String(m.content ?? '').slice(0, 400)}`).join('\n');
  try {
    const msg = await groq(fetchImpl, apiKey, {
      model: ADVISOR_CONFIG.classifierModel,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM },
        { role: 'user', content: `${recent ? `Recent conversation:\n${recent}\n\n` : ''}Latest message:\n${String(message).slice(0, 2000)}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'scope', strict: true, schema: CLASSIFIER_SCHEMA } },
      temperature: 0,
      max_completion_tokens: 200,
    }, ADVISOR_CONFIG.classifierTimeoutMs);
    const category = JSON.parse(msg.content ?? '{}').category;
    return SCOPE_CATEGORIES.includes(category) ? category : null;
  } catch {
    return null;
  }
}

/**
 * Guarded advisor reply. Off-topic → fixed refusal without calling the main model.
 * Returns { reply, model, scope }.
 */
export async function advisorReply({ apiKey, system, history = [], message, model = MARKET_CONFIG.model, fetchImpl = fetch }) {
  const scope = await classifyMessage({ apiKey, message, history, fetchImpl });
  if (scope === 'off_topic') return { reply: OFF_TOPIC_REPLY, model: ADVISOR_CONFIG.classifierModel, scope };
  const { reply, model: used } = await groqChat({ apiKey, system: `${system}\n${SCOPE_RULES}`, history, message, model, fetchImpl });
  return { reply, model: used, scope: scope ?? 'unclassified' };
}
