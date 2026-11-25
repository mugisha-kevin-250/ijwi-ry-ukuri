const Article = require('../models/Article');
const { GUIDE, isSiteQuestion } = require('./aiSiteGuide');

/**
 * What RADAR AI is allowed to know when a reader asks it something.
 *
 * Three desks answer behind one box, and this file decides which one:
 *
 * - the news desk, which may state nothing that is not a published story;
 * - the help desk, which answers a question about RADAR itself from the
 *   handbook in aiSiteGuide - how to write here, how to publish, how an
 *   account, an alert, an advert or a correction works;
 * - the research desk, which explains the world a reader asks about and says
 *   plainly that what it says is not this newsroom's reporting.
 *
 * The first rule is the one that keeps this a newsroom and not a chatbot: a
 * reader's question about the news is answered from stories this newsroom has
 * published, and from nothing else. Only `status: 'published'` is ever queried,
 * so a draft, or a story an editor rejected, cannot be talked into the open by
 * someone asking the right question. The
 * article a reader is standing on is looked up in the database rather than
 * taken from whatever the page sends, because a browser can put anything in
 * that field and the model would then repeat a visitor's own words back to them
 * as fact.
 *
 * Two ceilings keep the call cheap and the answer honest: the body of the
 * current story is truncated to what a reader would call the story, and the
 * recent-headlines list is short enough to sit inside a prompt without pushing
 * the question itself out of the window.
 */
const HEADLINE_LIMIT = 15;
const BODY_EXCERPT_CHARS = 4000;
const SUMMARY_LIMIT = 400;

function sectionName(article) {
  return String(article?.category?.name || '');
}

/** The stored text of a published story, or null when the slug is not one. */
async function publishedStoryFor(slug) {
  const wanted = String(slug || '').trim().slice(0, 200);
  if (!wanted) return null;

  const article = await Article.findOne({ slug: wanted, status: 'published' })
    .populate('category', 'name slug')
    .select('title summary content publishedAt category tags')
    .lean();

  if (!article) return null;

  return {
    slug: wanted,
    title: String(article.title || ''),
    section: sectionName(article),
    publishedAt: article.publishedAt || null,
    summary: String(article.summary || '').slice(0, SUMMARY_LIMIT),
    excerpt: String(article.content || '').replace(/\s+/g, ' ').trim().slice(0, BODY_EXCERPT_CHARS),
    tags: Array.isArray(article.tags) ? article.tags.slice(0, 6) : []
  };
}

/** The front page, as lines the model can point a reader back to. */
async function recentHeadlines() {
  const articles = await Article.find({ status: 'published' })
    .populate('category', 'name')
    .select('title summary publishedAt slug')
    .sort({ publishedAt: -1 })
    .limit(HEADLINE_LIMIT)
    .lean();

  return articles
    .filter((article) => article.title)
    .map((article) => ({
      slug: String(article.slug || ''),
      title: String(article.title || ''),
      section: sectionName(article),
      publishedAt: article.publishedAt || null,
      summary: String(article.summary || '').slice(0, 220)
    }));
}

/**
 * Which desk answers.
 *
 * The order is not arbitrary. A question about this site is the only one the
 * handbook may answer, so it is checked first and a story page does not get to
 * pull it back onto the news. After that, a question the newsroom can actually
 * ground - the reader is standing on a published story, or two of their own
 * words turn up in the same headline - goes to the desk that is forbidden from
 * using anything but our reporting. Everything else is the research desk, and
 * it is the answer of a help desk rather than a refusal.
 */
const STOP_WORDS = new Set([
  'what', 'which', 'when', 'where', 'who', 'whom', 'whose', 'why', 'how', 'is', 'are', 'was', 'were', 'be', 'been', 'does', 'did', 'do',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'about', 'into', 'from', 'by', 'at', 'as', 'it', 'its', 'this',
  'that', 'these', 'those', 'there', 'their', 'they', 'them', 'he', 'she', 'we', 'you', 'i', 'me', 'my', 'your', 'has', 'have', 'had',
  'will', 'would', 'could', 'should', 'can', 'may', 'might', 'not', 'no', 'yes', 'very', 'more', 'most', 'much', 'many', 'any', 'some'
]);

function significantWords(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

/** Two real words shared with one headline is a question about that story. */
function matchesAHeadline(question, headlines) {
  const words = significantWords(question);
  if (!words.length) return false;
  return headlines.some((row) => {
    const text = `${row.title} ${row.summary}`.toLowerCase();
    return words.filter((word) => text.includes(word)).length >= 2;
  });
}

/**
 * Questions aimed at this newsroom rather than at the world.
 *
 * A reader asking "what is the biggest story today" names nothing that appears
 * in any headline, so the match above cannot see it and the question fell to
 * the research desk, which answered by introducing itself. That is the reply
 * that reads to a person as a broken feature: they asked what RADAR has, and
 * got what RADAR is.
 *
 * The cue is not a topic word but what the question points at - our coverage,
 * or the news of the moment - so it takes a newsish noun together with either a
 * pointer to us or a marker of time. Each on its own is too loose: "what is the
 * weather today" is a question about the sky and not about the front page, and
 * "tell me a joke about journalists" is not a question about our reporting.
 *
 * Passing it on to the news desk changes what the model is allowed to use, not
 * what it is handed: the news desk states nothing that is not a published
 * story, so an unpopular answer here is an honest one about our own files.
 */
const NEWS_WORDS = ['story', 'stories', 'news', 'headline', 'report', 'reporting', 'covered', 'coverage', 'article', 'update', 'journalism'];
const OUR_POINTERS = ['radar', 'you', 'your', 'this site', 'the site', 'site', 'we', 'our'];
const OF_THE_MOMENT = ['today', 'tonight', 'yesterday', 'latest', 'biggest', 'top', 'new', 'recent', 'currently', 'now', 'this week', 'this month', 'breaking', 'front page', 'any news', 'is there news'];

function asksForOurNews(question) {
  const text = String(question || '').toLowerCase();
  if (!text.trim()) return false;
  const aboutNews = NEWS_WORDS.some((word) => text.includes(word));
  const aboutUs = OUR_POINTERS.some((word) => new RegExp(`\\b${word}\\b`).test(text));
  const ofTheMoment = OF_THE_MOMENT.some((phrase) => text.includes(phrase));
  return (aboutNews && (aboutUs || ofTheMoment)) || (aboutUs && ofTheMoment);
}

/**
 * The sky over the reader.
 *
 * A reader who asks "how is the weather" is asking a question with a real answer
 * that this site already knows how to fetch: the weather desk calls the same
 * source the /weather page uses, through the same key, and caches by place. So
 * the desk reads it rather than letting the model guess at a climate, and hands
 * over the measurement with the place it belongs to named in it - if the answer
 * is for Kigali because that is what the site defaults to, the model is told to
 * say Kigali instead of pretending it found the reader.
 *
 * The device can hand over coordinates when the reader allowed it, which is the
 * one form that needs no guessing; otherwise the place is whatever the question
 * named, and failing that the site's default city.
 */
const WEATHER_WORDS = ['weather', 'forecast', 'temperature', 'rain', 'rainy', 'snow', 'humid', 'windy', 'sunny', 'cloudy', 'degrees', 'hot', 'cold', 'umbrella'];
const PLACE_STOP = new Set(['the', 'a', 'an', 'this', 'that', 'town', 'city', 'country', 'area', 'place', 'here', 'there', 'today', 'tomorrow', 'right', 'now', 'outside']);

function wantsWeather(question) {
  const text = String(question || '').toLowerCase();
  return WEATHER_WORDS.some((word) => text.includes(word));
}

/** "What is the weather in Huye" is a question about Huye. */
function placeInQuestion(question) {
  const match = /\b(?:in|at|for|of|near|around)\s+([A-Za-zÀ-ÿ'., -]{2,40})/i.exec(String(question || ''));
  if (!match) return '';
  const words = match[1].toLowerCase().split(/[\s,]+/).filter((w) => w && !PLACE_STOP.has(w) && w.length > 1);
  return words.slice(0, 3).join(' ').trim();
}

function weatherBrief(report) {
  const loc = report?.location || {};
  const cur = report?.current || {};
  const place = [loc.name, loc.region, loc.country].filter(Boolean).join(', ');
  if (!place && cur.tempC === undefined) return '';
  return [
    'THE WEATHER MEASURED JUST NOW BY THIS SITE\'S WEATHER DESK',
    `Place: ${place || 'not named by the source'}`,
    loc.localtime ? `Local time there: ${loc.localtime}` : '',
    `Now: ${cur.condition || 'unclear'}, ${cur.tempC}°C (feels like ${cur.feelsC}°C), humidity ${cur.humidity}%, wind ${cur.windKph} km/h ${cur.windDir || ''}, chance of rain ${cur.chanceOfRain}%`,
    `Reading taken: ${cur.lastUpdated || (report.fetchedAt ? new Date(report.fetchedAt).toISOString() : 'recently')}`,
    'This is a live measurement, not reporting. Answer the reader with it, but name the place it belongs to: if that place is not where the reader is, say which city the reading is for rather than claiming to know them.'
  ].filter(Boolean).join('\n');
}

/** The live reading for a question, or an empty string when there is no weather in it. */
async function weatherFor({ question, near }) {
  if (!wantsWeather(question) && !String(near || '').trim()) return '';
  const wanted = [String(near || '').trim(), placeInQuestion(question)].find(Boolean);
  try {
    const weather = require('./weatherService');
    const result = await weather.report({ q: wanted });
    if (!result?.ok || !result.report) return '';
    return weatherBrief(result.report);
  } catch {
    // The weather source is a separate service from the newsroom's files, and
    // its bad minute is no reason to withhold an answer the desk can give.
    return '';
  }
}

function pickMode({ question, story, headlines }) {
  if (isSiteQuestion(question)) return 'site';
  if (story || matchesAHeadline(question, headlines) || asksForOurNews(question)) return 'news';
  return 'research';
}

/**
 * One question, asked once.
 *
 * `slug` is what a story page sends. `topic` is what the home panel sends when
 * a reader asks about something it can see on the front page: it is not a slug,
 * so it only picks which published story to read out as context, and when
 * nothing matches, the headlines list is the whole grounding. Either way the
 * model is told which article it is standing on, so the answer can name it.
 *
 * The answer comes back with the desk that wrote it, because "where did this
 * come from" is part of the answer, and the page has to say it.
 */
async function ask({ question, history = [], slug, topic, near, attachments = [] } = {}) {
  const gemini = require('./geminiService');
  const headlines = await recentHeadlines();

  let story = await publishedStoryFor(slug);

  if (!story && topic) {
    const wanted = String(topic).trim().toLowerCase().slice(0, 120);
    const match = wanted ? headlines.find((row) => row.title.toLowerCase().includes(wanted)) : null;
    if (match?.slug) story = await publishedStoryFor(match.slug);
  }

  const mode = pickMode({ question, story, headlines });
  // The sky is read only when the question or the device asks for it, and its
  // failure costs this answer nothing - see weatherFor.
  const weather = await weatherFor({ question, near });
  const result = await gemini.askReader({
    question,
    history,
    story: mode === 'site' ? null : story,
    headlines,
    mode,
    guide: GUIDE,
    weather,
    // Whatever the reader sent with the question, already checked for shape and
    // size by the route. It is the reader's material and the desk is told so.
    attachments: Array.isArray(attachments) ? attachments : []
  });

  return {
    answer: result.answer,
    model: result.model,
    generatedAt: result.generatedAt,
    // 'news' came from published reporting, 'site' from this newsroom's own
    // handbook, 'research' from the model and is labelled as such on the page.
    kind: mode,
    // How many of the reader's own pictures or documents the answer looked at,
    // so the page can mark the reply as being about what they sent.
    attached: (Array.isArray(attachments) ? attachments : []).length,
    groundedOn: mode === 'site' ? null : story ? { slug: story.slug, title: story.title } : null,
    // How many published stories the reader could be pointed at, so the page
    // can say "this answer came from the newsroom's own reporting" honestly.
    headlineCount: headlines.length
  };
}

module.exports = { ask, publishedStoryFor, recentHeadlines, pickMode, matchesAHeadline, asksForOurNews, HEADLINE_LIMIT };
