const Article = require('../models/Article');

/**
 * What RADAR AI is allowed to know when a reader asks it something.
 *
 * The rule this file exists to hold: a reader's question is answered from
 * stories this newsroom has published, and from nothing else. Only `status:
 * 'published'` is ever queried, so a draft, or a story an editor rejected,
 * cannot be talked into the open by someone asking the right question. The
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
 * One question, asked once.
 *
 * `slug` is what a story page sends. `topic` is what the home panel sends when
 * a reader asks about something it can see on the front page: it is not a slug,
 * so it only picks which published story to read out as context, and when
 * nothing matches, the headlines list is the whole grounding. Either way the
 * model is told which article it is standing on, so the answer can name it.
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

  const result = await gemini.askReader({ question, history, story, headlines });

  return {
    answer: result.answer,
    model: result.model,
    generatedAt: result.generatedAt,
    groundedOn: story ? { slug: story.slug, title: story.title } : null,
    // How many published stories the reader could be pointed at, so the page
    // can say "this answer came from the newsroom's own reporting" honestly.
    headlineCount: headlines.length
  };
}

module.exports = { ask, publishedStoryFor, recentHeadlines, HEADLINE_LIMIT };
