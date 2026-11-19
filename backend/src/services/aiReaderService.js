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

function pickMode({ question, story, headlines }) {
  if (isSiteQuestion(question)) return 'site';
  if (story || matchesAHeadline(question, headlines)) return 'news';
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
async function ask({ question, history = [], slug, topic } = {}) {
  const gemini = require('./geminiService');
  const headlines = await recentHeadlines();

  let story = await publishedStoryFor(slug);

  if (!story && topic) {
    const wanted = String(topic).trim().toLowerCase().slice(0, 120);
    const match = wanted ? headlines.find((row) => row.title.toLowerCase().includes(wanted)) : null;
    if (match?.slug) story = await publishedStoryFor(match.slug);
  }

  const mode = pickMode({ question, story, headlines });

  const result = await gemini.askReader({
    question,
    history,
    story: mode === 'site' ? null : story,
    headlines,
    mode,
    guide: GUIDE
  });

  return {
    answer: result.answer,
    model: result.model,
    generatedAt: result.generatedAt,
    // 'news' came from published reporting, 'site' from this newsroom's own
    // handbook, 'research' from the model and is labelled as such on the page.
    kind: mode,
    groundedOn: mode === 'site' ? null : story ? { slug: story.slug, title: story.title } : null,
    // How many published stories the reader could be pointed at, so the page
    // can say "this answer came from the newsroom's own reporting" honestly.
    headlineCount: headlines.length
  };
}

module.exports = { ask, publishedStoryFor, recentHeadlines, pickMode, matchesAHeadline, HEADLINE_LIMIT };
