const env = require('../config/env');

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// A story takes longer than a chat reply, and Render's free tier kills slow
// responses at ten seconds, so each kind of call gets its own ceiling and is
// cut off cleanly instead of hanging the request.
const TIMEOUT_MS = Number(env.GEMINI_TIMEOUT_MS || 90000);
const CHAT_TIMEOUT_MS = Number(env.GEMINI_CHAT_TIMEOUT_MS || 45000);

function isConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

function activeModel() {
  return env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * One call to Gemini, whatever it is being asked for.
 *
 * Everything the newsroom wants from the model - a story, a research answer, a
 * list of picture links - goes through here, so the timeout, the error codes and
 * the "did it actually finish" check are written once instead of drifting apart
 * in three places. It answers with the model's own words; reading those words as
 * a story or a photo list is the caller's business.
 */
async function callGemini({
  contents,
  systemInstruction,
  temperature = 0.55,
  topP = 0.95,
  maxOutputTokens = 1600,
  responseMimeType,
  timeoutMs = TIMEOUT_MS
}) {
  if (!isConfigured()) {
    const error = new Error('Gemini is not configured on the server');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${ENDPOINT}/${activeModel()}:generateContent`, {
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
        }
      }),
      signal: controller.signal
    });
  } catch (err) {
    const error = new Error(err.name === 'AbortError' ? 'Gemini took too long to answer' : 'Gemini could not be reached');
    error.code = 'AI_UNREACHABLE';
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // The status is the part that matters. Gemini's own error text can describe
    // the request that made it, so it is kept short and never carries a key.
    const detail = payload?.error?.message || `Gemini answered with ${response.status}`;
    const error = new Error(String(detail).slice(0, 200));
    error.code = response.status === 401 || response.status === 403 ? 'AI_BAD_KEY' : response.status === 429 ? 'AI_RATE_LIMIT' : 'AI_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    const error = new Error(finish === 'MAX_TOKENS' ? 'Gemini stopped before finishing the answer' : `Gemini declined this request (${finish})`);
    error.code = 'AI_BLOCKED';
    throw error;
  }

  const text = readText(candidate);
  if (!text) {
    const error = new Error('Gemini returned an empty answer');
    error.code = 'AI_EMPTY';
    throw error;
  }
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
  '- When you rely on a specific article, name it the way a reader would recognise it - its headline - so they can go and read it.'
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

async function askReader({ question, history = [], story = null, headlines = [] } = {}) {
  const asked = String(question || '').trim().slice(0, 2000);
  if (!asked) {
    const error = new Error('Ask RADAR AI a question first');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const contents = toContents([...(Array.isArray(history) ? history : []), { role: 'user', text: asked }]);
  if (!contents.length) {
    const error = new Error('Ask RADAR AI a question first');
    error.code = 'AI_EMPTY';
    throw error;
  }

  const answer = await callGemini({
    contents,
    systemInstruction: `${READER_SYSTEM_BASE}\n\n${readerBriefing({ story, headlines })}`,
    temperature: 0.4,
    topP: 0.9,
    maxOutputTokens: 900,
    timeoutMs: CHAT_TIMEOUT_MS
  });

  return { answer, model: activeModel(), generatedAt: new Date().toISOString() };
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

module.exports = { isConfigured, activeModel, writeStory, chat, askReader, photoLinks, radioScript, adCreative };
