const crypto = require('crypto');
const env = require('../config/env');
const Translation = require('../models/Translation');
const languages = require('../data/translateLanguages');

/**
 * Google Cloud Translation, v2.
 *
 * A reader chooses a language and the news arrives in it. Two rules shape
 * everything below. The first is that Google is a paid third party: the same
 * sentence is only ever bought once, so every translation is stored and served
 * from the database unless the English original has changed. The second is that
 * a translation that does not happen must never be a broken page: the English
 * original is always returned, and the reason comes along with it so the site
 * can say "shown in English because…" instead of lying about the language.
 */

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

// What the caller is told when things go wrong. Never the key, never the
// response body, which can echo the text being translated.
const NOT_CONFIGURED = 'not_configured';
const UNSUPPORTED = 'unsupported_language';
const TOO_LONG = 'too_long';
const REFUSED = 'service_refused';
const LIMIT = 'rate_limited';

function configured() {
  return Boolean(env.GOOGLE_TRANSLATE_API_KEY);
}

function status() {
  return {
    configured: configured(),
    defaultLanguage: languages.default,
    reason: configured() ? null : 'translations are not configured on this server (GOOGLE_TRANSLATE_API_KEY is not set)',
  };
}

function hashOf(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => `${part.field}\u0000${part.source}`).join('\u0001'), 'utf8')
    .digest('hex');
}

/**
 * One story or one page of text, cut into pieces Google can take and that can be
 * put back together exactly. Paragraphs stay separate items so the line breaks
 * survive; a paragraph longer than the ceiling is cut between sentences.
 */
function toUnits(text) {
  const clean = String(text === undefined || text === null ? '' : text).replace(/\r\n/g, '\n');
  if (!clean.trim()) return [];
  const max = Math.max(500, Number(env.TRANSLATE_CHUNK_CHARS) || 4000);
  const units = [];

  clean.split(/\n{2,}/).forEach((block) => {
    const paragraph = block.trim();
    if (!paragraph) return;

    if (paragraph.length <= max) {
      units.push({ text: paragraph, before: units.length ? '\n\n' : '' });
      return;
    }

    const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+["')\]]?\s*|$)/g) || [paragraph];
    let piece = '';
    let firstInParagraph = true;
    const emit = () => {
      if (!piece) return;
      units.push({ text: piece, before: firstInParagraph ? (units.length ? '\n\n' : '') : ' ' });
      firstInParagraph = false;
      piece = '';
    };
    sentences.forEach((sentence) => {
      const next = sentence.trim();
      if (!next) return;
      const candidate = piece ? `${piece} ${next}` : next;
      if (piece && candidate.length > max) emit();
      piece = piece ? `${piece} ${next}` : next;
    });
    emit();
  });

  return units;
}

class TranslateError extends Error {
  constructor(reason, detail) {
    super(`translation ${reason}`);
    this.reason = reason;
    this.detail = detail || '';
  }
}

// Google answers with HTML entities escaped - " &amp; " and " &#39; " - and the
// site renders these as plain text, not as markup. Decoding once here means no
// reader ever sees an ampersand code in a headline, and nothing here parses HTML.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = parseInt(body[1] === 'x' || body[1] === 'X' ? body.slice(2) : body.slice(1), body[1] === 'x' || body[1] === 'X' ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Ask Google for one batch of pieces, in the order they were sent. */
async function requestBatch(pieces, target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(env.TRANSLATE_TIMEOUT_MS) || 12000));
  try {
    const response = await fetch(
      `${ENDPOINT}?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: pieces, source: 'en', target, format: 'text' }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      // 429 is Google's quota or a burst; anything else is a refusal we cannot fix.
      throw new TranslateError(response.status === 429 ? LIMIT : REFUSED, String(response.status));
    }
    const body = await response.json();
    const translations = body && body.data && Array.isArray(body.data.translations) ? body.data.translations : null;
    if (!translations || translations.length !== pieces.length) {
      throw new TranslateError(REFUSED, 'shape');
    }
    return translations.map((item) => (item && typeof item.translatedText === 'string' ? decodeEntities(item.translatedText) : ''));
  } catch (error) {
    if (error instanceof TranslateError) throw error;
    if (error && error.name === 'AbortError') throw new TranslateError(REFUSED, 'timeout');
    throw new TranslateError(REFUSED, error && error.message ? 'network' : 'unknown');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a list of plain strings in one or a few paid calls.
 * Returns them in the same order. Throws TranslateError, never returns English
 * silently - the caller decides what a failure looks like to the reader.
 */
async function translateTexts(texts, target) {
  const list = Array.isArray(texts) ? texts.map((text) => String(text === undefined || text === null ? '' : text)) : [];
  if (!list.length) return [];
  if (!configured()) throw new TranslateError(NOT_CONFIGURED);
  const lang = languages.normalize(target);
  if (!lang) throw new TranslateError(UNSUPPORTED);
  const total = list.reduce((sum, text) => sum + text.length, 0);
  if (total > Math.max(1000, Number(env.TRANSLATE_MAX_CHARS) || 60000)) throw new TranslateError(TOO_LONG);

  const out = [];
  const max = Math.max(500, Number(env.TRANSLATE_CHUNK_CHARS) || 4000);
  let batch = [];
  let size = 0;

  const flush = async () => {
    if (!batch.length) return;
    const done = await requestBatch(batch, lang);
    out.push(...done);
    batch = [];
    size = 0;
  };

  for (const text of list) {
    if (!text.trim()) {
      await flush();
      out.push(text);
      continue;
    }
    if (size + text.length > max) await flush();
    batch.push(text);
    size += text.length;
    if (size >= max) await flush();
  }
  await flush();
  return out;
}

/** Rebuild one string from translated units, keeping the original breaks. */
function fromUnits(units, texts) {
  let out = '';
  units.forEach((unit, index) => {
    const piece = String(texts[index] === undefined || texts[index] === null ? '' : texts[index]).trim();
    if (!piece) return;
    out += out ? `${unit.before}${piece}` : piece;
  });
  return out;
}

// A translation is only ever as good as the copy it is attached to, so the hash
// is of the English text, not of the story's updatedAt: an edit that does not
// change a field does not spend money on it again, and an edit that does means
// the reader is never served a sentence the newsroom has already corrected.
function sourceHashOf(parts) {
  return hashOf(parts);
}

async function cached(kind, lang, key) {
  return Translation.findOne({ kind, lang, key }).lean();
}

function partsToMap(record) {
  const fields = {};
  (record && Array.isArray(record.parts) ? record.parts : []).forEach((part) => {
    if (!part || !part.field) return;
    fields[part.field] = part.text;
  });
  return fields;
}

/**
 * Translate many things at once - the whole home page, one story, the site's
 * own labels. `items` is [{ key, article, parts: [{ field, source }] }].
 * Anything already bought and unchanged comes from the database; the rest goes
 * to Google in as few calls as the pieces allow.
 *
 * Returns { lang, translated: {key: {field: text}}, failed, reason }.
 */
async function translateMany(kind, target, items) {
  const lang = languages.normalize(target);
  if (!configured()) return { lang, translated: {}, failed: items.length, reason: NOT_CONFIGURED };
  if (!lang || lang === languages.default) return { lang, translated: {}, failed: 0, reason: null };
  if (!items.length) return { lang, translated: {}, failed: 0, reason: null };

  const wanted = items.map((item) => ({
    key: String(item.key),
    article: item.article || null,
    parts: (item.parts || []).filter((part) => part && part.field && String(part.source || '').trim()),
    hash: sourceHashOf(item.parts || []),
  }));

  const existing = await Translation.find({ kind, lang, key: { $in: wanted.map((item) => item.key) } }).lean();
  const byKey = new Map(existing.map((record) => [record.key, record]));

  const translated = {};
  const pending = [];
  wanted.forEach((item) => {
    const record = byKey.get(item.key);
    if (record && record.sourceHash === item.hash) {
      translated[item.key] = partsToMap(record);
      return;
    }
    pending.push(item);
  });

  if (!pending.length) return { lang, translated, failed: 0, reason: null };

  // Every piece of every pending item goes up as one flat list, so a page of
  // twelve stories costs one call and not twelve.
  const plan = [];
  const flat = [];
  pending.forEach((item) => {
    const shapes = [];
    item.parts.forEach((part) => {
      const units = toUnits(part.source);
      if (!units.length) {
        shapes.push({ field: part.field, units: [], offset: flat.length });
        return;
      }
      units.forEach((unit) => flat.push(unit.text));
      shapes.push({ field: part.field, units, offset: flat.length - units.length });
    });
    plan.push({ item, shapes });
  });

  let results;
  try {
    results = await translateTexts(flat, lang);
  } catch (error) {
    return { lang, translated, failed: pending.length, reason: error && error.reason ? error.reason : REFUSED };
  }

  for (const entry of plan) {
    const rebuilt = {};
    entry.shapes.forEach((shape) => {
      const source = entry.item.parts.find((part) => part.field === shape.field);
      if (!shape.units.length) {
        rebuilt[shape.field] = String(source ? source.source || '' : '');
        return;
      }
      const slice = results.slice(shape.offset, shape.offset + shape.units.length);
      rebuilt[shape.field] = fromUnits(shape.units, slice);
    });

    translated[entry.item.key] = rebuilt;
    const parts = entry.item.parts.map((part) => ({
      field: part.field,
      source: String(part.source || ''),
      text: rebuilt[part.field] || '',
    }));
    try {
      await Translation.updateOne(
        { kind, lang, key: entry.item.key },
        {
          $set: {
            kind,
            lang,
            key: entry.item.key,
            article: entry.item.article,
            sourceHash: entry.item.hash,
            parts,
            chars: parts.reduce((sum, part) => sum + part.source.length, 0),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      // A stored translation is a saving, not a requirement. If the write fails
      // the reader still gets the text that was just bought.
      console.warn('translation not cached:', error.codeName || error.message);
    }
  }

  return { lang, translated, failed: 0, reason: null };
}

const STORY_FIELDS = ['title', 'summary', 'content', 'metaDescription'];

function storyItem(article) {
  const id = String(article._id || article.id);
  const parts = STORY_FIELDS.filter((field) => article[field])
    .map((field) => ({ field, source: String(article[field]) }));
  // The section label printed on the card is part of what the reader reads, so
  // it travels with the story. A category name that is already the reader's
  // language simply comes back the same way.
  const category = article.category;
  const categoryName = category && typeof category === 'object' ? String(category.name || '').trim() : '';
  if (categoryName) parts.push({ field: 'categoryName', source: categoryName });
  return { key: id, article: id, parts };
}

/**
 * Give a list of stories back in the language the reader asked for. The objects
 * are copies; a translated title never overwrites the English one in memory or
 * in the database, so an editor's list is always the original text.
 */
async function applyLanguage(articles, target) {
  const list = Array.isArray(articles) ? articles : [];
  const lang = languages.normalize(target);
  if (!list.length || !lang || lang === languages.default || !configured()) {
    return { articles: list, lang: lang || null, translated: false, reason: !configured() ? NOT_CONFIGURED : null };
  }
  const plain = list.map((article) => (article && article.toObject ? article.toObject({ virtuals: false }) : article));
  const result = await translateMany('story', lang, plain.map(storyItem));
  if (result.failed === list.length && result.reason) {
    return { articles: list, lang, translated: false, reason: result.reason };
  }
  const withLanguage = plain.map((article) => {
    const fields = result.translated[String(article._id)] || {};
    const copy = { ...article };
    STORY_FIELDS.forEach((field) => {
      if (fields[field]) copy[field] = fields[field];
    });
    if (fields.categoryName && copy.category && typeof copy.category === 'object') {
      copy.category = { ...copy.category, name: fields.categoryName };
    }
    copy.translation = { lang, translated: Object.keys(fields).length > 0 };
    return copy;
  });
  return { articles: withLanguage, lang, translated: true, reason: result.reason || null };
}

/**
 * One line in a route: the stories a reader asked for, in the language their
 * address on the page asked for. Nothing changes when ?lang is absent, so every
 * existing caller and every crawler keeps getting the English original.
 */
async function forRequest(req, articles) {
  const result = await applyLanguage(articles, req && req.query ? req.query.lang : undefined);
  return result.articles;
}

/** The site's own words, translated as one set and cached as one row. */
async function chromeStrings(strings, target) {
  const entries = Object.entries(strings || {})
    .filter(([key, value]) => typeof key === 'string' && typeof value === 'string' && value.trim())
    .slice(0, 2000);
  const lang = languages.normalize(target);
  if (!lang || lang === languages.default || !entries.length) {
    return { lang: lang || null, strings: {}, translated: false, reason: null };
  }
  const parts = entries.map(([key, value]) => ({ field: key, source: value }));
  const result = await translateMany('chrome', lang, [{ key: 'chrome', article: null, parts }]);
  const fields = result.translated.chrome || {};
  const missing = Object.keys(fields).length < entries.length;
  return {
    lang,
    strings: fields,
    translated: Object.keys(fields).length > 0 && !missing,
    reason: result.reason || (missing ? REFUSED : null),
  };
}

module.exports = {
  TranslateError,
  applyLanguage,
  chromeStrings,
  configured,
  forRequest,
  isSupported: languages.isSupported,
  languages: languages.list(),
  normalizeLang: languages.normalize,
  status,
  translateTexts,
  defaultLanguage: languages.default,
  reasons: { NOT_CONFIGURED, UNSUPPORTED, TOO_LONG, REFUSED, LIMIT },
};
