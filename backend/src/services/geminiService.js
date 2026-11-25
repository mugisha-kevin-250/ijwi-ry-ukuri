const env = require('../config/env');

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// A story takes longer than a chat reply, and Render's free tier kills slow
// responses at ten seconds, so each kind of call gets its own ceiling and is
// cut off cleanly instead of hanging the request.
const TIMEOUT_MS = Number(env.GEMINI_TIMEOUT_MS || 90000);
const CHAT_TIMEOUT_MS = Number(env.GEMINI_CHAT_TIMEOUT_MS || 45000);

/**
 * A moment when Google's own model is too busy to answer.
 *
 * Measured against the live key, a plain reader question comes back 503
 * "This model is currently experiencing high demand" roughly once in six
 * tries, at random, and the very next call answers in two seconds. That is a
 * property of the model's capacity pool, not of the question and not of this
 * newsroom's key - which is why the answer is a second attempt rather than a
 * sentence telling the reader to rephrase. The second attempt goes to another
 * model because a busy pool usually has an idle neighbour, and it has to fit
 * inside the thirty seconds the browser waits, so the reader's desk keeps a
 * short ceiling per try: a median of about two seconds means a try that has
 * reached eleven is not going to be the one that answers.
 */
const READER_TIMEOUT_MS = Number(env.GEMINI_READER_TIMEOUT_MS || 14000);
const READER_RETRY_PAUSE_MS = Number(env.GEMINI_READER_RETRY_PAUSE_MS || 700);
// Measured against this newsroom's key: gemini-3.1-flash-lite answers, while
// gemini-2.5-flash and gemini-2.5-flash-lite come back 404 "no longer
// available to new users". A fallback that does not exist is worse than no
// fallback, because the reader's second try fails on the way.
const FALLBACK_MODEL = String(env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite');
const BUSY_STATUS = new Set([500, 502, 503, 504]);

/**
 * What a reader may attach to a question.
 *
 * Three pictures, or three documents, per question - enough to ask "what does
 * this show" or "summarise this", not enough for one tab to spend the
 * newsroom's month uploading a gallery. The base64 ceiling is the size of the
 * encoded picture, so a two-megabyte photo fits and a ten-megabyte scan does
 * not; the text ceiling is what a model can be given without pushing the
 * reader's own question out of the window. Neither is a promise of storage:
 * nothing here is kept - the bytes go into one call and are gone with it.
 */
const MAX_ATTACHMENT_B64 = 3_200_000;
const MAX_ATTACHMENT_TEXT = 12_000;

/** The failures another model or another second can clear, and only those. */
function isBusyMoment(error) {
  if (!error) return false;
  if (error.code === 'AI_UNREACHABLE') return true;
  return error.code === 'AI_REQUEST_FAILED' && BUSY_STATUS.has(Number(error.status));
}

/**
 * A failure about the model's name rather than about the question or the key.
 *
 * A retired name comes back 404 "no longer available to new users", which is
 * not the kind of thing a second second fixes - but it is exactly the kind of
 * thing a different name fixes. This matters most when the server was handed a
 * name by its environment: the queue is then asked to carry on to the fallback
 * instead of returning "rephrase your question" to a reader whose question was
 * fine and whose newsroom is simply pointed at a model that no longer exists.
 */
function isUnknownModel(error) {
  if (!error) return false;
  if (Number(error.status) === 404) return true;
  return /not found|no longer available|unsupported|invalid `?model|model name/i.test(String(error?.message || ''));
}

/**
 * Google saying no to the request shape, not to the question.
 *
 * A 400 comes back in well under a second - it is an answer about the call, not
 * a model thinking - so it is safe to spend another attempt on. The newsroom's
 * only 400-shaped habit is asking for the web-search tool on a model or a plan
 * that does not carry it, which fails every question in the mode that asked for
 * it and looks, from the reader's side, like a desk that refuses to speak.
 */
function isToolRefusal(error) {
  return String(error?.code || '') === 'AI_REQUEST_FAILED' && Number(error?.status) === 400;
}

/**
 * Whether the next name in the queue is worth trying.
 *
 * A 400 "invalid argument" is Google's sentence about the request, and models
 * disagree about what a request may contain: one name's generation config is
 * another's rejection. Because a 400 comes back in under a second, walking the
 * queue costs a reader almost nothing and is the difference between an answer
 * and a shrug. A refusal on the merits (AI_BLOCKED) is not in this list on
 * purpose - a second model would only refuse it again.
 */
function isWorthAskingAgain(error) {
  return isBusyMoment(error) || isUnknownModel(error) || isToolRefusal(error);
}

/**
 * Google's own words about the call, cleaned enough to print.
 *
 * The code and the status say which kind of failure this was; the sentence the
 * upstream sent says which field it objected to, and that is the difference
 * between fixing this and guessing at it. So it is held here - compressed,
 * capped, with every long opaque run replaced so no credential could ride out
 * of it, and never containing a reader's question, which is not part of an
 * error the upstream returns about a request shape.
 */
function describeFailure(error) {
  const raw = String(error?.message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  return raw.replace(/[A-Za-z0-9_+\-/]{24,}/g, '[redacted]').slice(0, 160);
}

function modelsToTry(primary) {
  const wanted = String(primary || activeModel());
  const fallback = FALLBACK_MODEL && FALLBACK_MODEL !== wanted ? FALLBACK_MODEL : '';
  return fallback ? [wanted, fallback] : [wanted];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

/**
 * The last way a call to Google failed, kept in memory for the status route.
 *
 * A reader's "it did not answer" and an owner's "why" are the same event seen
 * from two ends of a log they cannot both open, and Render's logs are not the
 * only place to look. So the code, the HTTP status, the model it came from and
 * how many tries it took are held here - never the key, never the reader's
 * question, never the model's own words - and `/api/ai/status` prints them for
 * whoever is asked to explain a failure.
 */
let lastFailure = null;

function noteFailure(error, attemptCount) {
  // The route's one-line log reads the same number off the error it is holding,
  // so both places report the same try count rather than one of them guessing.
  if (error && typeof error === 'object') error.attempts = Number(attemptCount || 1);
  lastFailure = {
    at: new Date().toISOString(),
    code: String(error?.code || 'UNKNOWN'),
    status: Number(error?.status || 0) || null,
    model: String(error?.model || '') || null,
    detail: describeFailure(error),
    attempts: Number(attemptCount || 1)
  };
  return lastFailure;
}

function lastFailureInfo() {
  return lastFailure;
}

/** The two names the reader's question is put to, and whether the web is read. */
function fallbackModel() {
  return FALLBACK_MODEL;
}

function searchGroundingEnabled() {
  return Boolean(env.GEMINI_GROUND_SEARCH);
}

function activeModel() {
  return String(env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL;
}

/**
 * The shape of the key this server was given, without the key.
 *
 * "The desk is not connected" is the honest sentence for the reader and the
 * useless one for whoever has to fix it, because the difference between an old
 * key, a key cut short in a paste and a key for another project is invisible
 * from the outside. So the status desk prints how long the value is, whether it
 * has the form Google's keys have, and a short fingerprint of it - a one-way
 * digest, the same for the same key everywhere, and no use to anyone who found
 * it. Compare a live fingerprint with the one from the working copy and the
 * question "is this the key I think it is?" answers itself.
 */
function keyShape() {
  const key = String(env.GEMINI_API_KEY || '');
  if (!key) return null;
  const raw = String(process.env.GEMINI_API_KEY || '').trim();
  return {
    length: key.length,
    // Reported so a salvaged paste can be told from a clean one: the value
    // typed into the dashboard was longer than the key read out of it.
    rawLength: raw.length,
    recovered: raw.length !== key.length,
    looksComplete: key.length >= 30 && !/\s/.test(key),
    fingerprint: require('crypto').createHash('sha256').update(key).digest('hex').slice(0, 8)
  };
}

/**
 * One call to Gemini, whatever it is being asked for.
 *
 * Everything the newsroom wants from the model - a story, a research answer, a
 * list of picture links - goes through here, so the timeout, the error codes and
 * the "did it actually finish" check are written once instead of drifting apart
 * in three places. It answers with the model's own words; reading those words as
 * a story or a photo list is the caller's business.
 *
 * A caller that passes more than one model is asking for the busy-moment
 * handling above: the question is put again to the next model, after a short
 * pause, and only when the failure was the kind a second try can clear. Callers
 * that do not pass a list get exactly the one attempt they asked for, which is
 * what the admin's generators and the photo search still do.
 */
async function callGeminiDetailed({
  contents,
  systemInstruction,
  temperature = 0.55,
  topP = 0.95,
  maxOutputTokens = 1600,
  responseMimeType,
  timeoutMs = TIMEOUT_MS,
  useSearchGrounding = false,
  models = null,
  retryPauseMs = 0
}) {
  if (!isConfigured()) {
    const error = new Error('Gemini is not configured on the server');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const queue = Array.isArray(models) && models.length ? models : [activeModel()];
  let lastError = null;

  for (let attempt = 0; attempt < queue.length; attempt++) {
    const model = queue[attempt];
    if (attempt && retryPauseMs > 0) await sleep(retryPauseMs);

    try {
      const text = await callOneModel({
        model,
        contents,
        systemInstruction,
        temperature,
        topP,
        maxOutputTokens,
        responseMimeType,
        timeoutMs,
        useSearchGrounding
      });
      return { text, model, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      // The rest of the queue is only worth walking for a failure another name
      // or another second can clear. A key Google does not accept and an answer
      // its safety read refused are true of every model on the key, and
      // re-asking them spends the reader's time to say the same thing.
      if (!isWorthAskingAgain(error)) {
        noteFailure(error, attempt + 1);
        throw error;
      }
    }
  }

  noteFailure(lastError, queue.length);
  throw lastError;
}

async function callOneModel({
  model,
  contents,
  systemInstruction,
  temperature,
  topP,
  maxOutputTokens,
  responseMimeType,
  timeoutMs,
  useSearchGrounding
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        generationConfig: {
          temperature,
          topP,
          maxOutputTokens,
          ...(responseMimeType ? { responseMimeType } : {})
        },
        // Grounding on the open web is a switch the newsroom throws, not a
        // guess this server makes: it costs more per answer, only some models
        // accept it, and the site's own handbook must be answered from the
        // handbook. When it is on, the model reads the web before it speaks and
        // the call comes back with the pages it used.
        ...(useSearchGrounding ? { tools: [{ google_search: {} }] } : {})
      }),
      signal: controller.signal
    });
  } catch (err) {
    const error = new Error(err.name === 'AbortError' ? `${model} took too long to answer` : `${model} could not be reached`);
    error.code = 'AI_UNREACHABLE';
    error.model = model;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // The status is the part that matters. Gemini's own error text can describe
    // the request that made it, so it is kept short and never carries a key.
    const detail = payload?.error?.message || `${model} answered with ${response.status}`;
    const error = new Error(String(detail).slice(0, 200));
    // A 400 that says the key is not valid is a key problem, whatever the
    // number looks like - Google answers a quoted or spent key with 400 rather
    // than the 403 an API reader would expect. Calling it what it is keeps the
    // reader's sentence honest ("the desk is not connected", not "rephrase
    // your question"), keeps the queue from re-asking a bad key a second time,
    // and keeps the detail free of anything but Google's own line.
    const keyRefused = /api key not valid|invalid api key|permission denied/i.test(String(detail));
    error.code = response.status === 401 || response.status === 403 || (response.status === 400 && keyRefused)
      ? 'AI_BAD_KEY'
      : response.status === 429 ? 'AI_RATE_LIMIT' : 'AI_REQUEST_FAILED';
    error.status = response.status;
    error.model = model;
    throw error;
  }

  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    const error = new Error(finish === 'MAX_TOKENS' ? 'Gemini stopped before finishing the answer' : `Gemini declined this request (${finish})`);
    error.code = 'AI_BLOCKED';
    error.model = model;
    throw error;
  }

  const text = readText(candidate);
  if (!text) {
    const error = new Error('Gemini returned an empty answer');
    error.code = 'AI_EMPTY';
    error.model = model;
    throw error;
  }
  return text;
}

async function callGemini(options) {
  const { text } = await callGeminiDetailed(options);
  return text;
}

/**
 * The thread the admin's browser holds, in the shape the API expects.
 *
 * Gemini calls the answering side "model", refuses a thread that opens with the
 * assistant, and charges for every turn, so the oldest turns fall off rather
 * than the newest ones and each stored string is capped before it is sent.
 */
function toContents(history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .slice(-12)
    .map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(turn.text).slice(0, 8000) }]
    }));
  // A replayed or half-saved thread can open with the model's own answer.
  while (turns.length && turns[0].role === 'model') turns.shift();
  return turns;
}

// A model told to answer in JSON sometimes wraps it in a fence anyway, so the
// fence comes off before the braces are looked for.
function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('Gemini replied without something we could read');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function buildPrompt({ topic, angle, audience, evidence, region }) {
  const lines = [
    `Write a news article in English about: ${topic}`,
    region ? `The story is being filed for readers in/around ${region}.` : '',
    audience === 'world'
      ? 'Write for a general international audience.'
      : 'Centre the story on Rwanda and the region, and say so plainly when a fact is only known internationally.',
    angle ? `Editorial angle to follow: ${angle}` : '',
    '',
    evidence && evidence.length
      ? [
          'Real coverage Google listed against this topic, for background only:',
          ...evidence.map((item) => `- ${item.source || 'unknown'}: ${item.title}`),
          'Do not copy a sentence from any of them, do not put words in their mouths, and do not credit a',
          'detail to one of them unless it is the only thing you were told about it.',
          ''
        ].join('\n')
      : '',
    'Rules you must follow:',
    '- Report only what you are confident is true. Never invent quotes, names of people, statistics, dates or documents.',
    '- If a figure or detail is uncertain, say what is not yet confirmed instead of guessing.',
    '- No first person, no marketing tone, no adjectives that praise the subject.',
    '- Structure it as a news report: the most important fact first, then background, then what happens next.',
    '- Six to eight short paragraphs, each of two to four sentences.',
    '- A headline of at most 90 characters that also works as the search-result title.',
    '- A meta description of at most 155 characters: what a search engine shows under the link. It must not',
    '  repeat the headline and must not read like an advertisement.',
    '- A summary of at most 200 characters that is not a repeat of the headline.',
    '- Three to five lowercase tags.',
    '',
    'Return ONLY a JSON object with exactly these keys:',
    '{"title": string, "metaDescription": string, "summary": string, "paragraphs": string[], "tags": string[]}',
    '"paragraphs" holds only the body sentences, no headline, no bullet lists, no markdown.'
  ];
  return lines.filter((line) => line !== '').join('\n');
}

function readText(candidate) {
  const parts = candidate?.content?.parts || [];
  return parts.map((part) => part.text || '').join('').trim();
}

function parseStory(text) {
  const parsed = parseJson(text);
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? parsed.paragraphs.map((line) => String(line).trim()).filter(Boolean)
    : [];
  return {
    title: String(parsed.title || '').trim(),
    metaDescription: String(parsed.metaDescription || '').trim(),
    summary: String(parsed.summary || '').trim(),
    paragraphs,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 6) : []
  };
}

async function writeStory({ topic, angle, audience = 'rwanda', evidence, region } = {}) {
  const text = await callGemini({
    contents: [{ role: 'user', parts: [{ text: buildPrompt({ topic, angle, audience, evidence, region }) }] }],
    maxOutputTokens: 1600,
    responseMimeType: 'application/json'
  });

  let story;
  try {
    story = parseStory(text);
  } catch (err) {
    const error = new Error('Gemini returned something we could not read as a story');
    error.code = 'AI_BAD_OUTPUT';
    error.cause = err;
    throw error;
  }

  if (!story.title || story.paragraphs.length === 0) {
    const error = new Error('Gemini returned an empty story');
    error.code = 'AI_EMPTY';
    throw error;
  }

  return {
    ...story,
    content: story.paragraphs.join('\n\n'),
    model: activeModel(),
    generatedAt: new Date().toISOString()
  };
}

/**
 * The research desk.
 *
 * An admin asks it what to look into before a story is written: who to call,
 * what document to ask for, which figures need checking. It is deliberately not
 * a second writer - a chat answer that reads like publishable prose is the
 * fastest way to put something online that nobody verified. So the instruction
 * says plainly that the model is not the source, and every answer has to hand
 * the editor something they can go and confirm for themselves.
 */
const RESEARCH_SYSTEM = [
  'You are the research desk inside the newsroom of RADAR, a Rwandan news site with readers across the region and the diaspora.',
  'The person writing to you is an editor preparing to report a story. They are not asking you to report it for them.',
  '',
  'How to answer:',
  '- Be direct and short: two to five short paragraphs, or a list of concrete leads when a list is what is wanted.',
  '- Give the editor things they can go and verify - named institutions, named offices, public documents to request, official bodies that publish the figure, searches to run, questions to ask on the phone.',
  '- Say which parts you are confident about and which are leads that have to be checked. Mark anything you are unsure of as unverified rather than letting it read like a fact.',
  '- Never write a sentence that could be pasted straight into a published story. Never invent a quote, a name, a figure, a date or a document.',
  '- If something is after your knowledge, or too small and local for you to genuinely know, say you do not know and say what to check instead. That is a useful answer here.',
  '- Answer in English. Plainly, with no preamble and no summary of your own answer at the end.'
].join('\n');

async function chat(question, history = []) {
  const asked = String(question || '').trim().slice(0, 4000);
  if (!asked) {
    const error = new Error('Ask the research desk something first');
    error.code = 'AI_EMPTY';
    throw error;
  }
  const contents = toContents([...(Array.isArray(history) ? history : []), { role: 'user', text: asked }]);
  if (!contents.length) {
    const error = new Error('Ask the research desk something first');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const reply = await callGemini({
    contents,
    systemInstruction: RESEARCH_SYSTEM,
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 1200,
    timeoutMs: CHAT_TIMEOUT_MS
  });

  return { reply, model: activeModel(), generatedAt: new Date().toISOString() };
}

/**
 * The reader's question desk.
 *
 * Anyone on the site - signed in or not - can ask RADAR AI about the news. The
 * instruction here is the opposite of the research desk on purpose: an editor
 * needs leads to chase, and a reader needs what this newsroom already published
 * explained. So the model is handed the story the reader is standing on plus
 * the headlines currently on the site, is told those are the only facts it has,
 * and is told to say plainly when the answer is not among them rather than
 * filling the gap with something plausible.
 *
 * The grounding is built by aiReaderService, which only ever reads published
 * stories. A draft an editor has not approved cannot reach a reader's chat.
 */
const READER_SYSTEM_BASE = [
  'You are RADAR AI, the question desk of RADAR, a Rwandan news site with readers across the region and the diaspora.',
  'The person writing to you is a reader, not a member of staff. They are asking about the news.',
  '',
  'What you know about this story:',
  '- The material the newsroom gives you below - the article the reader is reading and the list of what RADAR has published - is the only thing you may state as fact.',
  '- You may explain what that material means: put a figure in context, define a term, say who the institutions involved are, summarise what happened, connect two stories the newsroom has both filed.',
  '- If the answer is not in that material, say so in one sentence and say what RADAR has or has not reported on. Then point to the story that comes closest. Do not pad the silence with general knowledge about current events.',
  '- Never invent a name, a number, a quote, a date or an event, and never extend what the newsroom reported into a development it did not report.',
  '- You are not a journalist here and you are not a source. Anything you are unsure of is described as unsure, not presented as news.',
  '',
  'How to answer:',
  '- Three short paragraphs at most, or a few lines of plain prose. No headings, no preamble, no summary of your own answer at the end.',
  '- Answer the question that was actually asked. If the reader asks in another language, answer in that language; otherwise answer in English.',
  '- When you rely on a specific article, name it the way a reader would recognise it - its headline - so they can go and read it.',
  '- When the reader asks what is on, what is biggest or what happened lately instead of asking about one article, that is a question about this list and it is answered from it: name the two or three headlines that carry the news of the moment and say in a line what each is about. If the list is empty, say so.'
].join('\n');

/**
 * The two other things a reader asks a newsroom's AI desk.
 *
 * Both exist because the rule above - "say nothing that is not in a published
 * story" - is right about the news and wrong about everything else. A question
 * about how to publish here, or about what a place or a term means, is not a
 * request for reporting this site does not have, and refusing it made the desk
 * look broken to the person most likely to become a writer.
 *
 * The difference between the three is kept honest rather than smoothed over:
 * each mode is told which of its sentences are the newsroom's own and which
 * are not, and the answer carries that label out to the page.
 */
const READER_SITE_SYSTEM = [
  'You are RADAR AI, the help desk of RADAR, answering a question about RADAR itself: how to use the site, how to write or publish here, how an account, a section, an alert, an advert or a correction works.',
  'This is not a news question and it is not answered from stories. It is answered from the handbook of this newsroom, written below, which is the only description of this site you may repeat.',
  '',
  'How to answer:',
  '- Walk the reader through it in order: the page they open, the button they press, what happens next, and who decides. Number the steps when there is more than one.',
  '- Name the real addresses - /writer/dashboard, /contact, /advertising, /search, /weather, /live-sports, /corrections - exactly as the handbook gives them. Never invent an address, a menu item, a button label or a rule.',
  '- Say what is true and uncomfortable when it is true: applying to write does not make anyone a writer, an editor decides, and nothing here is promised on a timetable.',
  '- If the handbook does not cover the question, say that plainly in a sentence and send the reader to /contact. Do not fill the gap with a plausible-sounding process.',
  '- A reader is not staff. Never describe a step only an editor or an admin can do as something they can do.',
  '- Answer in the language the reader wrote in, in plain prose, and never longer than the question needs.'
].join('\n');

const READER_RESEARCH_SYSTEM = [
  'You are RADAR AI, the question desk of a Rwandan news site. The reader has come to talk to you: a greeting, "who are you", "what can you do", a term, a place, an institution, a person, a rule of a game, how something works, a piece of history or science, an opinion they want weighed, a translation, a calculation, a draft they want written, or a general "what does this mean for" question.',
  'Answer it. A reader is allowed to ask you anything, and "we have not published about that" is not an answer to a question that is not about our publication.',
  'This desk is a conversation, not a lookup form. A reader may say hello, ask what you are, then change the subject twice in one sitting. Follow them, hold the thread of what was already said, and never refuse a question because it is not news.',
  '',
  'What you may say, and how to mark it:',
  '- Your own general knowledge is fair game here. Use it, and be useful with it: explain, define, put the thing in context, give the well-established background, do the arithmetic, write the draft, carry the small talk.',
  '- You are RADAR AI. When a reader asks who or what you are, say that in one line - a question desk on a Rwandan news site, run on Google\'s Gemini, answering from published RADAR reporting for news and from general knowledge for everything else - and then answer what they actually wanted. Do not claim to be a reporter, an editor, or a person.',
  '- The list of what RADAR has published, when it is given below, is the only thing you may present as this newsroom\'s reporting. If a published story touches the subject, say so and name the headline; if none does, say RADAR has not reported on it.',
  '- Never dress general knowledge up as news, a quotation, a statistic, or something this site confirmed. Do not attribute to RADAR, to any news agency, or to any person a statement you cannot stand behind.',
  '- Say "I am not sure" rather than guessing a number, a date, a name or a result, and say plainly when something may have changed since your knowledge was last updated.',
  '- A question that turns on a live event - who won today, what the central bank decided this week, whether someone is still in office - is the newsroom\'s business, not yours. Answer what you can in background terms and point the reader to the section that would carry it.',
  '',
  'How to answer:',
  '- Match the length to the question. "Hi" and "what can you do" get a sentence or two and an invitation to ask; an explanation, a comparison or a set of steps gets three or four short paragraphs, or numbered points when the reader asked for steps. No headings, no preamble, no restating the question.',
  '- Answer in the language the reader wrote in.',
  '- Be direct and generous: the reader came to a news site to find something out, and leaving them knowing more is the whole job.'
].join('\n');

function readerBriefing({ story, headlines } = {}) {
  const blocks = [];

  if (story && story.title) {
    blocks.push([
      'THE STORY THE READER IS ON',
      `Headline: ${story.title}`,
      story.section ? `Section: ${story.section}` : '',
      story.publishedAt ? `Published: ${new Date(story.publishedAt).toUTCString()}` : '',
      story.summary ? `Summary: ${story.summary}` : '',
      story.excerpt ? 'Opening paragraphs:\n' + story.excerpt : ''
    ].filter(Boolean).join('\n'));
  }

  const list = (Array.isArray(headlines) ? headlines : []).filter((row) => row && row.title);
  if (list.length) {
    blocks.push([
      'WHAT RADAR HAS PUBLISHED RECENTLY',
      ...list.map((row) => {
        const when = row.publishedAt ? new Date(row.publishedAt).toISOString().slice(0, 10) : 'undated';
        const where = row.section ? ` (${row.section})` : '';
        const line = row.summary ? ` - ${row.summary}` : '';
        return `- ${when}: ${row.title}${where}${line}`;
      })
    ].join('\n'));
  }

  if (!blocks.length) {
    blocks.push('THE NEWSROOM HAS NO PUBLISHED MATERIAL TO GIVE YOU FOR THIS QUESTION.');
  }

  return `${blocks.join('\n\n')}\n\nRemember: the above is everything you may treat as fact.`;
}

/**
 * The three names behind this site, given the same way by every desk.
 *
 * "Who developed RADAR" is a question a reader asks out of curiosity and a
 * writer asks before trusting the site with their byline, and there is one
 * right answer: Mugisha Aime Kevin, then Ndatimana Dododce, then Shyaka Clever
 * Prince. It goes into every reader instruction rather than only the handbook,
 * because the question arrives as a research question, as a site question, and
 * from a story page, and a model left to guess at who made it will invent
 * someone.
 */
const READER_CREDITS = [
  'WHO MADE THIS SITE AND THIS DESK',
  'RADAR was developed by Mugisha Aime Kevin, with Ndatimana Dododce and Shyaka Clever Prince.',
  'When a reader asks who developed, built, coded, designed, owns or runs RADAR or RADAR AI, name them in that order: Mugisha Aime Kevin first, then Ndatimana Dododce, then Shyaka Clever Prince. Add no other name, invent no company, and say nothing about anyone else.'
].join('\n');

function readerInstruction({ mode, story, headlines, guide, weather, attachments }) {
  const extras = [READER_CREDITS, weather, attachments ? READER_ATTACHMENT_RULE : ''];
  if (mode === 'site') {
    return [`${READER_SITE_SYSTEM}\n\nTHE HANDBOOK OF THIS SITE\n${guide}`, ...extras];
  }
  if (mode === 'research') {
    return [`${READER_RESEARCH_SYSTEM}\n\n${readerBriefing({ headlines })}`, ...extras];
  }
  return [`${READER_SYSTEM_BASE}\n\n${readerBriefing({ story, headlines })}`, ...extras];
}

/**
 * What a picture or file the reader sent is, and what it is not.
 *
 * An attachment arrives as the reader's own material: it is not this
 * newsroom's reporting, it has not been checked by anyone here, and a model
 * that reads it as fact will happily tell a reader that a photograph of a
 * rumour is news. So the desk is told what it is looking at - describe what it
 * shows, say plainly that it came from the reader, and never let it loosen the
 * rule of the desk answering.
 */
const READER_ATTACHMENT_RULE = [
  'WHAT THE READER ATTACHED',
  'The reader sent one or more attachments with this question. They are the reader\'s material, not this newsroom\'s reporting: nothing in them is a fact this site has verified, and an image of a headline or a screenshot of a claim does not make it news.',
  'Look at what was attached and answer the question about it - describe what a picture shows, read the text in it, summarise or explain a document. Say in a line that it came from the reader when that matters, and if the reader asks whether it is true, the honest answer is that this site has not reported it.'
].join('\n');

/**
 * The reader's attachments, as parts of their own turn.
 *
 * Pictures go to the model as the model's own image part, from base64 the
 * browser supplied - nothing is stored, nothing is written to disk, and the
 * picture is gone when the call is answered. Text files arrive as text the
 * desk reads, capped the same way a question is capped.
 */
function attachmentParts(attachments) {
  const rows = Array.isArray(attachments) ? attachments.slice(0, 3) : [];
  const parts = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const mime = String(row.mime || '').toLowerCase();
    if (row.data && /^image\/(png|jpeg|jpg|webp|gif)$/.test(mime)) {
      const data = String(row.data).replace(/\s+/g, '');
      if (data.length >= 8 && data.length <= MAX_ATTACHMENT_B64) {
        parts.push({ inlineData: { mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime, data } });
      }
      continue;
    }
    const text = String(row.text || '').replace(/\r/g, '').slice(0, MAX_ATTACHMENT_TEXT);
    if (text.trim()) parts.push({ text: `FILE FROM THE READER (${String(row.name || 'document').slice(0, 80)})\n${text}` });
  }
  return parts;
}

async function askReader({ question, history = [], story = null, headlines = [], mode = 'news', guide = '', weather = '', attachments = [] } = {}) {
  const asked = String(question || '').trim().slice(0, 2000);
  const attached = attachmentParts(attachments);
  if (!asked && !attached.length) {
    const error = new Error('Ask RADAR AI a question first');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const contents = toContents([...(Array.isArray(history) ? history : []), { role: 'user', text: asked || 'I sent this without a question.' }]);
  if (!contents.length) {
    const error = new Error('Ask RADAR AI a question first');
    error.code = 'AI_EMPTY';
    throw error;
  }
  // The attachments belong to the question being asked now, so they ride on the
  // last user turn rather than opening a new one: a thread that starts with a
  // picture would otherwise let the model answer a picture nobody described.
  if (attached.length) contents[contents.length - 1].parts.push(...attached);

  // Which of the three desks answers decides what the model is allowed to lean
  // on. The site desk gets the handbook and no stories; the research desk gets
  // the headlines as a pointer and its own knowledge as the substance; the news
  // desk gets the story, the headlines, and nothing else. Every desk is told
  // who made this site, and gets the live sky when the question asked for it.
  const systemInstruction = readerInstruction({ mode, story, headlines, guide, weather, attachments: attached.length }).filter(Boolean).join('\n\n');

  const deskCall = (useSearchGrounding) => callGeminiDetailed({
    contents,
    systemInstruction,
    temperature: 0.4,
    topP: 0.9,
    maxOutputTokens: 1200,
    // The reader's own budget: one short try, a pause, and a second model
    // before the browser gives up. See the busy-moment note at the top.
    timeoutMs: READER_TIMEOUT_MS,
    models: modelsToTry(activeModel()),
    retryPauseMs: READER_RETRY_PAUSE_MS,
    // Only a question the newsroom cannot answer from its own files goes
    // looking, and only when the owner has thrown the switch.
    useSearchGrounding
  });

  const wantsTheWeb = mode === 'research' && Boolean(env.GEMINI_GROUND_SEARCH);
  let answer;
  try {
    answer = await deskCall(wantsTheWeb);
  } catch (error) {
    // Asking the web is an extra tool on a request that is otherwise the same.
    // When Google turns that request down with a 400 - the answer it gives to a
    // model or a plan that does not carry the tool - the question was never
    // read, so it is put again without the tool rather than reported to the
    // reader as a question they should rephrase. Any other failure keeps its
    // own sentence; a refusal on the merits is not retried.
    if (!wantsTheWeb || !isToolRefusal(error)) throw error;
    answer = await deskCall(false);
  }

  return { answer: answer.text, model: answer.model, generatedAt: new Date().toISOString() };
}

/**
 * Pictures for a story the newsroom has not taken.
 *
 * The model is asked for links to photographs that already exist and are public.
 * Every link it returns is then fetched by this server before an admin ever sees
 * it (see verifyPhotos in aiPhotoService), so nothing that does not load reaches
 * the page as a broken thumbnail. An empty list is an honest answer: there is no
 * picture here that we can stand behind, so someone has to find or take one.
 */
function buildPhotoPrompt({ topic, region }) {
  return [
    `Find photograph links that could run with a news story about: ${topic}`,
    region ? `The story is filed for readers in/around ${region}.` : '',
    '',
    'Rules:',
    "- Only links you are confident exist and are public: a news agency's own article image, a government or organisation press page image, a Wikimedia Commons file.",
    '- Give direct image links ending in .jpg, .jpeg, .png or .webp, or a Wikimedia Commons file page.',
    '- Never invent a URL and never guess a path. If you are not sure a link exists, leave it out.',
    '- Name the full-resolution file, not a reduced copy: never a Commons /thumb/ address or one ending in something like 800px-File.jpg, and no size query parameter. This site prints on phones and on desktops, and it asks the host for the largest copy up to 4K itself.',
    '- Say who owns the picture, in the words their own page uses.',
    '',
    'Return ONLY a JSON object:',
    '{"photos": [{"url": string, "credit": string, "source": string, "why": string}]}',
    'Up to eight entries. If you have nothing you are confident about, return {"photos": []}.'
  ].join('\n');
}

async function photoLinks({ topic, region } = {}) {
  const text = await callGemini({
    contents: [{ role: 'user', parts: [{ text: buildPhotoPrompt({ topic, region }) }] }],
    temperature: 0.4,
    maxOutputTokens: 1200,
    responseMimeType: 'application/json',
    timeoutMs: CHAT_TIMEOUT_MS
  });

  let list = [];
  try {
    const parsed = parseJson(text);
    list = Array.isArray(parsed.photos) ? parsed.photos : [];
  } catch (err) {
    const error = new Error('Gemini returned something we could not read as photo links');
    error.code = 'AI_BAD_OUTPUT';
    error.cause = err;
    throw error;
  }

  return {
    photos: list
      .map((photo) => ({
        url: String(photo?.url || '').trim(),
        credit: String(photo?.credit || '').trim().slice(0, 160),
        source: String(photo?.source || '').trim().slice(0, 120),
        why: String(photo?.why || '').trim().slice(0, 200)
      }))
      .filter((photo) => /^https:\/\/[^\s"'<>]{6,500}$/i.test(photo.url))
      .slice(0, 8),
    model: activeModel(),
    generatedAt: new Date().toISOString()
  };
}

/**
 * The words the radio desk reads before a bulletin.
 *
 * This is the one place the model is allowed to produce sentences that go
 * straight out loud without an editor reading them first, so the job is kept as
 * small as it can be: it is handed the headlines that are already published on
 * this site and asked only to introduce them and sign off. It is not given the
 * story bodies, not asked for background, and told plainly that it has no facts
 * of its own here. What comes back is checked against that - a script that
 * mentions nothing outside the list of headlines it was given is a script, and
 * one that invents a development is a reason to fall back to the written line.
 */
function buildRadioPrompt({ slotName, at, dayName, stories }) {
  return [
    `You are writing the presenter's links for a ${slotName} news bulletin on RADAR radio, a Rwandan news site.`,
    `The bulletin starts at ${at} on a ${dayName}. It carries these stories, in this order:`,
    ...stories.map((story, index) => `${index + 1}. ${story.title}${story.summary ? ` — ${story.summary}` : ''}`),
    '',
    'Write two short passages of spoken English:',
    '- "opening": two or three sentences. Name the programme and say that these are the stories RADAR has published. Then name the top two or three headlines in plain spoken language.',
    '- "closing": one sentence that signs off and points readers to the site for the full stories.',
    '',
    'Hard rules:',
    '- Use only what is in the list above. Add no fact, figure, name, place or development that is not written there.',
    '- Do not summarise beyond what the headline says. Do not speculate about what happens next.',
    '- No "good morning", no weather, no music cues, no emoji, no markdown, no stage directions. Sentences only.',
    '- Nothing may read as a claim about the world that is not already published on this site.',
    '',
    'Return ONLY a JSON object: {"opening": string, "closing": string}'
  ].join('\n');
}

async function radioScript({ slotName = 'news', at = '', dayName = '', stories = [] } = {}) {
  const list = (Array.isArray(stories) ? stories : []).slice(0, 12);
  if (!list.length) {
    const error = new Error('There is nothing in the bulletin to introduce');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const text = await callGemini({
    contents: [{ role: 'user', parts: [{ text: buildRadioPrompt({ slotName, at, dayName, stories: list }) }] }],
    // Low, because the task is to repeat what is already written and nothing else.
    temperature: 0.35,
    topP: 0.9,
    maxOutputTokens: 400,
    responseMimeType: 'application/json',
    timeoutMs: CHAT_TIMEOUT_MS
  });

  let opening = '';
  let closing = '';
  try {
    const parsed = parseJson(text);
    opening = String(parsed.opening || '').trim();
    closing = String(parsed.closing || '').trim();
  } catch (err) {
    const error = new Error('Gemini returned something we could not read as a script');
    error.code = 'AI_BAD_OUTPUT';
    error.cause = err;
    throw error;
  }

  // A script with no opening line is not a script, and one that ran long enough to
  // be inventing is worse than none. Either is refused rather than read out.
  if (!opening || opening.length > 700 || closing.length > 300) {
    const error = new Error('Gemini did not return a usable bulletin script');
    error.code = 'AI_BAD_OUTPUT';
    throw error;
  }

  return { opening, closing, model: activeModel(), generatedAt: new Date().toISOString() };
}

/**
 * The creative for an advertisement the newsroom sold.
 *
 * An admin types the brief - who is paying, what they actually offer, where the
 * link goes - and the model turns that into the words and colours of the unit.
 * The line between this and a story is the important one: a news story may be
 * drafted from what the model believes it knows, but an advertisement is a claim
 * a business is making to a reader, so the model is given nothing but the brief
 * and told in as many words that an invented price, date or phone number is a
 * defect rather than a flourish.
 *
 * It does not write markup, and it is not saved anywhere by this call. What comes
 * back is a draft the desk reads, edits if needed, and publishes - "AI writes, a
 * human publishes" is the rule the whole site runs on.
 */
function buildAdPrompt({ advertiser, offer, link, placement, tone, mustInclude }) {
  return [
    `Write the words and pick the colours for one small advertisement on a Rwandan news site.`,
    `Who is advertising: ${advertiser}`,
    `What they actually offer, in the advertiser's own words or the admin's notes:`,
    offer,
    link ? `The ad links to: ${link}` : '',
    placement ? `It will be shown in this space on the page: ${placement}.` : '',
    tone ? `Sound like this: ${tone}.` : 'Sound like a plain local business, not a slogan machine.',
    mustInclude ? `These facts must appear: ${mustInclude}.` : '',
    '',
    'Rules you must follow:',
    '- Use ONLY what is written above. Invent no price, percentage, discount, date, opening time, phone number, address, statistic, award, certification or customer claim.',
    '- If the brief does not say something, leave it out. A short honest ad is a good result here; a specific-sounding one that is not in the brief is a failure.',
    '- No exclamation marks, no "revolutionary", "unbeatable", "best in Rwanda", no superlatives the brief did not give you, no urgency you were not told about.',
    '- The reader must be able to tell, from the first line, which business this is and what they get.',
    `- "headline": at most 90 characters. "body": at most 220 characters, one or two sentences. "ctaLabel": at most 24 characters and it must describe what the link opens ("See the menu", "Book a place", not "Click here").`,
    '- "theme": three colours the ad is printed in - bg, fg, accent - as #rrggbb. Choose something that reads clearly at small size on a phone, and make sure fg contrasts with bg.',
    '',
    'Return ONLY a JSON object:',
    '{"headline": string, "body": string, "ctaLabel": string, "theme": {"bg": string, "fg": string, "accent": string}}'
  ].filter((line) => line !== '').join('\n');
}

const PLACEMENT_NAMES = {
  nav: 'the narrow strip above the section links, on every page (keep it to a few words)',
  list: 'a banner between rows of a story list',
  articleInline: 'a banner inside a story, between paragraphs',
  articleSidebar: 'the tall column beside a story',
  newsRail: 'the tall column beside a list of stories'
};

async function adCreative({ advertiser, offer, link, placement, tone, mustInclude } = {}) {
  const who = String(advertiser || '').trim().slice(0, 80);
  const what = String(offer || '').trim().slice(0, 1200);
  if (!who) {
    const error = new Error('Say who the advertisement is from');
    error.code = 'AI_EMPTY';
    throw error;
  }
  if (what.length < 12) {
    const error = new Error('Give the model something to work with: what the advertiser is actually offering');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const text = await callGemini({
    contents: [{
      role: 'user',
      parts: [{
        text: buildAdPrompt({
          advertiser: who,
          offer: what,
          link,
          placement: PLACEMENT_NAMES[placement] || placement,
          tone: tone ? String(tone).slice(0, 160) : '',
          mustInclude: mustInclude ? String(mustInclude).slice(0, 300) : ''
        })
      }]
    }],
    // Kept low. This job is to compress a brief someone else wrote, not to
    // come up with a marketing idea the advertiser never had.
    temperature: 0.45,
    topP: 0.9,
    maxOutputTokens: 400,
    responseMimeType: 'application/json',
    timeoutMs: CHAT_TIMEOUT_MS
  });

  let parsed;
  try {
    parsed = parseJson(text);
  } catch (err) {
    const error = new Error('Gemini returned something we could not read as an advertisement');
    error.code = 'AI_BAD_OUTPUT';
    error.cause = err;
    throw error;
  }

  const theme = parsed.theme && typeof parsed.theme === 'object' ? parsed.theme : {};
  const creative = {
    advertiser: who,
    headline: String(parsed.headline || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    body: String(parsed.body || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    ctaLabel: String(parsed.ctaLabel || '').replace(/\s+/g, ' ').trim().slice(0, 30),
    theme: {
      bg: String(theme.bg || '').trim().slice(0, 9),
      fg: String(theme.fg || '').trim().slice(0, 9),
      accent: String(theme.accent || '').trim().slice(0, 9)
    },
    // Where the model went beyond the brief there is nothing to fall back on but
    // the length, so the desk is told plainly that this still has to be read.
    needsReview: true,
    model: activeModel(),
    generatedAt: new Date().toISOString()
  };

  if (!creative.headline) {
    const error = new Error('Gemini did not return a usable headline');
    error.code = 'AI_EMPTY';
    throw error;
  }
  return creative;
}

module.exports = { isConfigured, activeModel, fallbackModel, searchGroundingEnabled, lastFailureInfo, keyShape, writeStory, chat, askReader, photoLinks, radioScript, adCreative };
