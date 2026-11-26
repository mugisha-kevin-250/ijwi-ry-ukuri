const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const Category = require('../models/Category');
const User = require('../models/User');
const trendService = require('./trendService');
const geminiService = require('./geminiService');
const workflow = require('./articleWorkflow');
const storyMedia = require('./storyMedia');
const generateSlug = require('../utils/generateSlug');

const SETTING_KEY = 'radarAutoManage';
const MAX_DRAFTS_PER_PASS = 2;
const MAX_PUBLISH_PER_PASS = 1;
const MIN_HEADLINES = 2;
const MIN_DISTINCT_PUBLISHERS = 2;
const MIN_BODY_CHARS = 1200;
const MIN_PARAGRAPHS = 5;
// High-impact subjects always require a human editor, even when other checks pass.
const HUMAN_REVIEW_PATTERN = /\b(?:election|electoral|president|prime minister|parliament|government|minister|politic|war|military|attack|terror|conflict|killed|death|fatal|crime|murder|rape|assault|arrest|court|trial|lawsuit|health|medical|medicine|drug|disease|outbreak|epidemic|pandemic|earthquake|flood|disaster|missing child|child abuse)\b/i;


async function getConfig() {
  const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
  const value = setting?.value && typeof setting.value === 'object' ? setting.value : {};
  return {
    enabled: value.enabled === true,
    ownerId: value.ownerId ? String(value.ownerId) : '',
    lastRunAt: value.lastRunAt || null,
    lastResult: value.lastResult || null,
    mode: 'autonomous-publish-with-safeguards',
  };
}

async function setEnabled(enabled, ownerId) {
  const current = await getConfig();
  const value = {
    ...current,
    enabled: enabled === true,
    ownerId: enabled ? String(ownerId || current.ownerId || '') : current.ownerId,
    updatedAt: new Date().toISOString(),
  };
  await PlatformSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { key: SETTING_KEY, value, description: 'RADAR autonomous research, safeguarded AI publishing, and action logging.' } },
    { upsert: true, new: true }
  );
  // Keep the legacy AI writer switch aligned with the master Auto Manage
  // control. Turning Auto Manage off also stops automatic AI publishing.
  await PlatformSetting.findOneAndUpdate(
    { key: 'aiAutoPublish' },
    { $set: { key: 'aiAutoPublish', value: enabled === true, description: 'Managed by RADAR Auto Manage; independent manual AI publishing remains available.' } },
    { upsert: true, new: true }
  );
  return getConfig();
}

function sourceDomain(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || !parsed.hostname) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function qualityGate(story, evidence) {
  const sources = (evidence?.headlines || []).filter((item) => sourceDomain(item.url));
  const domains = new Set(sources.map((item) => sourceDomain(item.url)));
  const paragraphs = Array.isArray(story?.paragraphs) ? story.paragraphs.filter((part) => String(part || '').trim().length >= 45) : [];
  const body = String(story?.content || paragraphs.join('\n\n')).trim();
  if (sources.length < MIN_HEADLINES || domains.size < MIN_DISTINCT_PUBLISHERS) {
    return 'Held: fewer than two distinct HTTPS publishers were available.';
  }
  if (!String(story?.title || '').trim() || String(story.title).trim().length < 18) {
    return 'Held: headline did not pass the minimum quality check.';
  }
  if (!String(story?.summary || '').trim() || String(story.summary).trim().length < 60) {
    return 'Held: summary was too short or missing.';
  }
  if (body.length < MIN_BODY_CHARS || paragraphs.length < MIN_PARAGRAPHS) {
    return 'Held: article was too short for automatic publication.';
  }
  if (/\b(?:as an ai|i cannot verify|not enough information to write|placeholder text)\b/i.test(body)) {
    return 'Held: generated copy contains an AI limitation or placeholder statement.';
  }
  if (HUMAN_REVIEW_PATTERN.test(String(evidence?.topic || '') + ' ' + String(story?.title || '') + ' ' + body.slice(0, 1800))) {
    return 'Held for human editorial review: the topic is sensitive or high-impact.';
  }
  return '';
}

/**
 * RADAR autonomous newsroom pass. Auto Manage may publish only a single
 * source-led story per pass after all quality gates pass. Weak, short,
 * duplicate, or poorly sourced stories are retained as drafts for a human.
 * The existing article lifecycle is used for both approval and publication,
 * so notifications, timestamps, audit events and public indexes stay intact.
 */
async function run() {
  const config = await getConfig();
  if (!config.enabled) return { skipped: true, reason: 'Auto Manage is switched off.' };
  if (!geminiService.isConfigured()) return { skipped: true, reason: 'Gemini is not configured.' };

  const admin = config.ownerId
    ? await User.findById(config.ownerId).select('_id role isActive').lean()
    : await User.findOne({ role: 'ADMIN', isActive: true }).select('_id role isActive').lean();
  if (!admin || admin.role !== 'ADMIN' || admin.isActive === false) {
    return { skipped: true, reason: 'The owner account is unavailable; no content was changed.' };
  }

  const radar = await trendService.radar();
  const leads = radar.geos
    .filter((geo) => geo.ok && !geo.stale)
    .flatMap((geo) => geo.topics.slice(0, 5).map((topic) => ({ geo: geo.geo, topic: topic.topic, score: topic.score?.total || 0 })))
    .sort((a, b) => b.score - a.score);
  const categories = await Category.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  if (!categories.length) return { skipped: true, reason: 'No active news categories are configured.' };

  const result = { researched: leads.length, drafted: 0, published: 0, duplicates: 0, held: 0, mediaAttached: 0, notes: [] };
  const used = new Set();
  for (const lead of leads) {
    if (result.drafted >= MAX_DRAFTS_PER_PASS) break;
    const key = lead.geo + ':' + lead.topic.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    try {
      const evidence = await trendService.evidenceFor(lead.geo, lead.topic);
      if (!evidence || !Array.isArray(evidence.headlines) || evidence.headlines.length < MIN_HEADLINES) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, outcome: 'held', reason: 'Insufficient source headlines.' });
        continue;
      }
      const sources = evidence.headlines.filter((item) => sourceDomain(item.url));
      const urls = [...new Set(sources.map((item) => item.url))];
      const domains = new Set(sources.map((item) => sourceDomain(item.url)));
      if (urls.length < MIN_HEADLINES || domains.size < MIN_DISTINCT_PUBLISHERS) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, outcome: 'held', reason: 'Fewer than two distinct HTTPS publishers.' });
        continue;
      }

      const duplicate = await Article.findOne({
        aiGenerated: true,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
        $or: [
          { title: new RegExp(lead.topic.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&'), 'i') },
          { 'sources.url': { $in: urls } },
        ],
      }).select('_id').lean();
      if (duplicate) {
        result.duplicates += 1;
        continue;
      }

      const story = await geminiService.writeStory({
        topic: evidence.topic,
        audience: lead.geo === 'RW' ? 'rwanda' : 'world',
        region: evidence.region,
        evidence: sources.slice(0, 5),
        angle: 'Write a careful, original, source-led report. Attribute claims to the named publisher, distinguish confirmed facts from claims, do not invent quotes, numbers, dates or details, and explicitly state when evidence is limited. Use at least five substantive paragraphs and do not pad with speculation.',
      });
      const failedGate = qualityGate(story, evidence);
      const lower = (story.tags || []).join(' ').toLowerCase() + ' ' + story.title.toLowerCase();
      const category = categories.find((item) => lower.includes(String(item.name || '').toLowerCase())) || categories[0];
      const title = String(story.title || '').trim().slice(0, 200);
      if (!title || !story.content || !story.summary) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, outcome: 'held', reason: 'AI returned incomplete article fields.' });
        continue;
      }

      // Attach only a source-provided image with a named publisher and source
      // article. storyMedia applies the same public-HTTPS/media rules as editors.
      const photo = trendService.photoCreditFor(evidence);
      let media = [];
      let featuredImage = '';
      let imageCredit = '';
      let imageSourceUrl = '';
      if (photo?.url && photo.source && sourceDomain(photo.articleUrl)) {
        const checked = storyMedia.normalize([{
          kind: 'image',
          url: photo.url,
          caption: photo.caption || title,
          credit: photo.source,
        }]);
        if (checked.ok && checked.media.length) {
          media = checked.media;
          featuredImage = checked.media[0].url;
          imageCredit = String(photo.source).slice(0, 160);
          imageSourceUrl = String(photo.articleUrl).slice(0, 1200);
          result.mediaAttached += 1;
        }
      }

      const slugBase = generateSlug(title) || 'radar-ai-story';
      const article = await Article.create({
        title,
        slug: `${slugBase}-${Date.now()}-${result.drafted + 1}`,
        summary: String(story.summary).slice(0, 600),
        metaDescription: String(story.metaDescription || story.summary).slice(0, 200),
        content: story.content,
        featuredImage,
        imageCredit,
        imageSourceUrl,
        imageCaption: featuredImage ? String(photo?.caption || title).slice(0, 240) : '',
        media,
        author: admin._id,
        category: category._id,
        tags: (story.tags || []).slice(0, 6),
        language: 'en',
        country: evidence.region,
        aiGenerated: true,
        status: 'pending_review',
        sources: sources.slice(0, 8).map((item) => ({
          title: item.title,
          organization: item.source || sourceDomain(item.url),
          url: item.url,
          type: 'link',
          verificationStatus: 'pending',
          addedBy: admin._id,
          at: new Date(),
        })),
        reviewEvents: [{
          from: 'draft',
          to: 'pending_review',
          by: null,
          note: 'RADAR AI Auto Manage created a source-linked story. Automated publication is conditional on the independent quality gate; source verification remains visibly pending.',
          at: new Date(),
        }],
      });
      result.drafted += 1;

      if (!failedGate && result.published < MAX_PUBLISH_PER_PASS) {
        const approval = await workflow.moveStory({
          article,
          to: 'approved',
          by: null,
          note: 'RADAR Auto Manage automated quality gate passed: distinct HTTPS publishers, complete article, minimum length and duplicate checks.',
        });
        if (approval.error) {
          result.held += 1;
          result.notes.push({ id: String(article._id), title: article.title, outcome: 'held', reason: approval.error });
          continue;
        }
        const publication = await workflow.moveStory({
          article: approval.article,
          to: 'published',
          by: null,
          note: 'Automatically published by RADAR Auto Manage after the configured safeguards passed. Source links remain attributed.',
        });
        if (publication.error) {
          result.held += 1;
          result.notes.push({ id: String(article._id), title: article.title, outcome: 'held', reason: publication.error });
          continue;
        }
        result.published += 1;
        result.notes.push({ id: String(article._id), title: article.title, category: category.name, outcome: 'published', media: Boolean(featuredImage) });
      } else {
        result.held += 1;
        result.notes.push({ id: String(article._id), title: article.title, category: category.name, outcome: 'held', reason: failedGate || 'Per-pass publication limit reached.' });
      }
    } catch (error) {
      result.held += 1;
      result.notes.push({ topic: lead.topic, outcome: 'failed', error: String(error.message || error).slice(0, 180) });
    }
  }

  const next = { ...config, lastRunAt: new Date().toISOString(), lastResult: result };
  await PlatformSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { value: next, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return result;
}

module.exports = { getConfig, setEnabled, run, qualityGate };
