const env = require('../config/env');

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// A story takes longer than a chat reply, and Render's free tier kills slow
// responses at ten seconds, so the request gets its own generous timeout.
const TIMEOUT_MS = Number(env.GEMINI_TIMEOUT_MS || 90000);

function isConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

function activeModel() {
  return env.GEMINI_MODEL || DEFAULT_MODEL;
}

function buildPrompt({ topic, angle, audience }) {
  const lines = [
    `Write a news article in English about: ${topic}`,
    audience === 'world'
      ? 'Write for a general international audience.'
      : 'Centre the story on Rwanda and the region, and say so plainly when a fact is only known internationally.',
    angle ? `Editorial angle to follow: ${angle}` : '',
    '',
    'Rules you must follow:',
    '- Report only what you are confident is true. Never invent quotes, names of people, statistics, dates or documents.',
    '- If a figure or detail is uncertain, say what is not yet confirmed instead of guessing.',
    '- No first person, no marketing tone, no adjectives that praise the subject.',
    '- Structure it as a news report: the most important fact first, then background, then what happens next.',
    '- Six to eight short paragraphs, each of two to four sentences.',
    '- A headline of at most 90 characters, a summary of at most 200 characters that is not a repeat of the headline.',
    '- Three to five lowercase tags.',
    '',
    'Return ONLY a JSON object with exactly these keys:',
    '{"title": string, "summary": string, "paragraphs": string[], "tags": string[]}',
    '"paragraphs" holds only the body sentences, no headline, no bullet lists, no markdown.'
  ];
  return lines.filter((line) => line !== '').join('\n');
}

function readText(candidate) {
  const parts = candidate?.content?.parts || [];
  return parts.map((part) => part.text || '').join('').trim();
}

function parseStory(text) {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('Gemini replied without a story');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? parsed.paragraphs.map((line) => String(line).trim()).filter(Boolean)
    : [];
  return {
    title: String(parsed.title || '').trim(),
    summary: String(parsed.summary || '').trim(),
    paragraphs,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 6) : []
  };
}

async function writeStory({ topic, angle, audience = 'rwanda' } = {}) {
  if (!isConfigured()) {
    const error = new Error('Gemini is not configured on the server');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${ENDPOINT}/${activeModel()}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt({ topic, angle, audience }) }] }],
        generationConfig: {
          temperature: 0.55,
          topP: 0.95,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json'
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
    const detail = payload?.error?.message || `Gemini answered with ${response.status}`;
    const error = new Error(detail);
    error.code = response.status === 401 || response.status === 403 ? 'AI_BAD_KEY' : response.status === 429 ? 'AI_RATE_LIMIT' : 'AI_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    const error = new Error(finish === 'MAX_TOKENS' ? 'Gemini stopped before finishing the story' : `Gemini declined this topic (${finish})`);
    error.code = 'AI_BLOCKED';
    throw error;
  }

  let story;
  try {
    story = parseStory(readText(candidate));
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

module.exports = { isConfigured, activeModel, writeStory };
