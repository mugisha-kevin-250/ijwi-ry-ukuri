process.env.MONGODB_URI = '';
// Set before ../src/app is required, because config/env reads the environment
// once at startup and the service asks that snapshot whether it can pay Google.
process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key-not-a-real-one';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Article = require('../src/models/Article');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const Translation = require('../src/models/Translation');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { seedSections } = require('../src/utils/seedDefaults');

/**
 * The translation desk, tested without spending anything.
 *
 * Google is replaced by a stub that answers in a fixed shape and counts every
 * call, which is the only way to prove the two promises this feature makes: a
 * reader gets the news in the language they asked for, and the same sentence is
 * never bought twice.
 */

const calls = [];

function installTranslatorStub() {
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), target: body.target, q: body.q });
    const prefix = `${body.target}: `;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: { translations: body.q.map((piece) => ({ translatedText: `${prefix}${piece}` })) },
      }),
    };
  };
}

let author;
let category;
const ORIGINAL = {
  title: 'Kigali opens a new market',
  summary: 'Traders move two hours earlier.',
  content: 'The order came on Monday.\n\nTraders disagree about it.\n\nThe district will review it in March.',
};

test.before(async () => {
  installTranslatorStub();
  await connectDatabase();
  await seedSections();
  category = await Category.findOne({ slug: 'business' }) || await Category.create({ name: 'Business', slug: 'business', isActive: true });
  author = await User.create({
    fullName: 'Ada Writer',
    username: 'ada',
    email: 'ada@example.com',
    password: 'Password123!',
    role: 'WRITER',
  });
  await Article.create({
    ...ORIGINAL,
    slug: 'kigali-opens-a-new-market',
    author: author._id,
    category: category._id,
    status: 'published',
    publishedAt: new Date(),
    language: 'en',
  });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the language list is Google\u2019s, not a list we maintain', async () => {
  const response = await request(app).get('/api/translate/languages');
  assert.equal(response.status, 200);
  const { languages, configured, defaultLanguage } = response.body.data;
  assert.equal(configured, true);
  assert.equal(defaultLanguage, 'en');
  assert.ok(languages.length > 100, `expected over a hundred languages, got ${languages.length}`);
  assert.ok(languages.some((item) => item.code === 'en'));
  assert.ok(languages.some((item) => item.code === 'lg'));
});

test('a language is recognised in whatever spelling the reader\u2019s browser uses', async () => {
  const brazil = await request(app).get('/api/translate/check?lang=pt_BR');
  assert.equal(brazil.body.data.language, 'pt');
  assert.equal(brazil.body.data.supported, true);

  const chinese = await request(app).get('/api/translate/check?lang=zh');
  assert.equal(chinese.body.data.language, 'zh-CN');

  const invented = await request(app).get('/api/translate/check?lang=qq-XX');
  assert.equal(invented.body.data.supported, false);
});

test('a story is served in the language the reader asked for, and the original survives', async () => {
  calls.length = 0;
  const response = await request(app).get('/api/articles/kigali-opens-a-new-market?lang=fr');
  assert.equal(response.status, 200);

  const article = response.body.data.article;
  assert.equal(article.title, 'fr: Kigali opens a new market');
  assert.equal(article.translation.lang, 'fr');
  assert.equal(article.translation.translated, true);
  // Paragraphs are the shape of a news story. A translator that flattened them
  // into one block would give the reader a wall of text.
  assert.equal(article.content, 'fr: The order came on Monday.\n\nfr: Traders disagree about it.\n\nfr: The district will review it in March.');

  // What the newsroom wrote is untouched, both in the row and on a second read.
  const stored = await Article.findOne({ slug: 'kigali-opens-a-new-market' }).lean();
  assert.equal(stored.title, ORIGINAL.title);
  assert.equal(stored.content, ORIGINAL.content);
});

test('the same story is bought once, and an edit is never served stale', async () => {
  const first = await Translation.findOne({ kind: 'story', lang: 'fr' }).lean();
  assert.ok(first, 'the French story should be stored');
  const hash = first.sourceHash;

  calls.length = 0;
  const again = await request(app).get('/api/articles/kigali-opens-a-new-market?lang=fr');
  assert.equal(again.body.data.article.title, 'fr: Kigali opens a new market');
  assert.equal(calls.length, 0, 'a stored translation must not ask Google again');

  // The newsroom corrects the headline. The stored French row is now about a
  // sentence that no longer exists, so it must be paid for again.
  await Article.updateOne({ _id: first.article }, { $set: { title: 'Kigali opens two new markets' } });
  const edited = await request(app).get('/api/articles/kigali-opens-a-new-market?lang=fr');
  assert.equal(calls.length, 1, 'a changed original has to be translated again');
  assert.equal(edited.body.data.article.title, 'fr: Kigali opens two new markets');
  const rehash = await Translation.findOne({ kind: 'story', lang: 'fr' }).lean();
  assert.notEqual(rehash.sourceHash, hash);
});

test('a page of stories costs one call, not one per story', async () => {
  const rows = [];
  for (let index = 0; index < 5; index += 1) {
    rows.push({
      title: `Second hand ${index}`,
      slug: `second-hand-${index}`,
      summary: `Summary ${index}`,
      content: `Body ${index}.`,
      author: author._id,
      category: category._id,
      status: 'published',
      publishedAt: new Date(),
      language: 'en',
    });
  }
  await Article.create(rows);

  calls.length = 0;
  const response = await request(app).get('/api/articles?limit=20&lang=sw');
  assert.equal(response.status, 200);
  const stories = response.body.data.articles;
  assert.ok(stories.length >= 6);
  assert.equal(calls.length, 1, 'the whole page should go up as one paid batch');
  assert.ok(stories.every((story) => story.title.startsWith('sw: ')));
  // The section name on the card is part of what the reader reads.
  assert.ok(stories.every((story) => story.category.name.startsWith('sw: ')));
});

test('English readers pay for nothing and are served the original', async () => {
  calls.length = 0;
  const plain = await request(app).get('/api/articles?limit=3');
  assert.equal(plain.status, 200);
  assert.ok(plain.body.data.articles.every((story) => !story.translation));
  assert.equal(calls.length, 0);

  const explicit = await request(app).get('/api/articles?limit=3&lang=en');
  assert.ok(explicit.body.data.articles.every((story) => !story.translation));
  assert.equal(calls.length, 0, 'asking for English out loud is still asking for the original');
});

test('the site\u2019s own labels come back as one set and refuse nonsense', async () => {
  calls.length = 0;
  const response = await request(app).post('/api/translate/chrome').send({
    lang: 'lg',
    strings: { 'nav.home': 'Home', 'nav.search': 'Search' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.translated, true);
  assert.deepEqual(response.body.data.strings, { 'nav.home': 'lg: Home', 'nav.search': 'lg: Search' });
  assert.equal(calls.length, 1);

  const cached = await request(app).post('/api/translate/chrome').send({
    lang: 'lg',
    strings: { 'nav.home': 'Home', 'nav.search': 'Search' },
  });
  assert.equal(cached.body.data.translated, true);
  assert.equal(calls.length, 1, 'the labels are bought once for everybody');

  const unknown = await request(app).post('/api/translate/chrome').send({ lang: 'qq-XX', strings: { a: 'A' } });
  assert.equal(unknown.status, 400);

  const malformed = await request(app).post('/api/translate/chrome').send({ lang: 'lg', strings: ['A'] });
  assert.equal(malformed.status, 400);

  const empty = await request(app).post('/api/translate/chrome').send({ lang: 'lg', strings: {} });
  assert.equal(empty.status, 400);
});

test('a language Google cannot serve leaves the reader in English, with a reason', async () => {
  const translate = require('../src/services/translateService');
  // The service reads the snapshot in config/env, so the honest fallback is
  // exercised by moving that snapshot rather than the process environment.
  const env = require('../src/config/env');
  const savedKey = env.GOOGLE_TRANSLATE_API_KEY;
  env.GOOGLE_TRANSLATE_API_KEY = '';
  try {
    const result = await translate.applyLanguage([await Article.findOne({ slug: 'kigali-opens-a-new-market' }).lean()], 'lg');
    assert.equal(result.translated, false);
    assert.equal(result.reason, 'not_configured');
    assert.equal(result.articles[0].title, 'Kigali opens two new markets');
    assert.ok(!result.articles[0].translation, 'a failed translation must not claim a language');

    const labels = await translate.chromeStrings({ 'nav.home': 'Home' }, 'lg');
    assert.equal(labels.translated, false);
    assert.deepEqual(labels.strings, {});

    const unconfigured = await request(app).post('/api/translate/chrome').send({ lang: 'lg', strings: { 'nav.home': 'Home' } });
    assert.equal(unconfigured.status, 200);
    assert.equal(unconfigured.body.data.translated, false);
    assert.match(unconfigured.body.data.reason, /GOOGLE_TRANSLATE_API_KEY/);

    const listed = await request(app).get('/api/translate/languages');
    assert.equal(listed.body.data.configured, false);
  } finally {
    env.GOOGLE_TRANSLATE_API_KEY = savedKey;
  }
});
