const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const Category = require('../models/Category');
const User = require('../models/User');
const trendService = require('./trendService');
const geminiService = require('./geminiService');
const aiPhotoService = require('./aiPhotoService');
const storyVideo = require('./storyVideo');
const workflow = require('./articleWorkflow');
const generateSlug = require('../utils/generateSlug');

const SETTING_KEY = 'radarAutoManage';
const MAX_STORIES_PER_PASS = 2;
const MIN_DISTINCT_SOURCES = 2;
const MIN_BODY_LENGTH = 600;
const MIN_PARAGRAPHS = 3;
// These subjects carry elevated harm if a machine gets a detail wrong. They
// remain in the editor queue even when their source links and copy pass checks.
const HUMAN_REVIEW_PATTERN = /\b(election|electoral|president|prime minister|parliament|government|minister|politic|war|military|attack|terror|conflict|killed|death|fatal|crime|murder|rape|assault|arrest|court|trial|lawsuit|health|medical|medicine|drug|disease|outbreak|epidemic|pandemic|earthquake|flood|disaster|missing child|child abuse)\b/i;

async function getConfig() {
  const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
  const value = setting?.value && typeof setting.value === 'object' ? setting.value : {};
  return {
    enabled: value.enabled === true,
    ownerId: value.ownerId ? String(value.ownerId) : '',
    lastRunAt: value.lastRunAt || null,
    lastResult: value.lastResult || null,
  };
}

async function saveRun(config, result) {
  const next = { ...config, lastRunAt: new Date().toISOString(), lastResult: result };
  await PlatformSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { key: SETTING_KEY, value: next, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return result;
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
    { $set: { key: SETTING_KEY, value, description: 'RADAR autonomous AI newsroom: source-led story preparation, safeguarded automatic publication, and run history.' } },
    { upsert: true, new: true }
  );
  return getConfig();
}

function cleanSourceRows(headlines, adminId) {
  const seen = new Set();
  return headlines.map((item) => {
    let parsed;
    try { parsed = new URL(String(item.url || '')); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || seen.has(host)) return null;
    seen.add(host);
    return {
      title: String(item.title || '').trim().slice(0, 300),
      organization: String(item.source || host).trim().slice(0, 120),
      url: parsed.toString().slice(0, 600),
      type: 'link',
      verificationStatus: 'pending',
      addedBy: adminId,
      at: new Date(),
    };
  }).filter((item) => item && item.title);
}

function qualityHoldReason({ lead, story, sources }) {
  if (sources.length < MIN_DISTINCT_SOURCES) return 'Fewer than two independent HTTPS source domains were available.';
  if (String(story.content || '').trim().length < MIN_BODY_LENGTH) return 'The generated article is too short for automatic publication.';
  const paragraphs = String(story.content || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length < MIN_PARAGRAPHS) return 'The generated article does not contain enough complete paragraphs.';
  if (String(story.summary || '').trim().length < 50) return 'The article summary is incomplete.';
  if (String(story.title || '').trim().length < 18) return 'The article headline is incomplete.';
  if (HUMAN_REVIEW_PATTERN.test(lead.topic + ' ' + story.title + ' ' + story.content.slice(0, 1800))) {
    return 'This is a high-impact or sensitive topic and requires a human editor.';
  }
  return '';
}

/**
 * Scheduled autonomous newsroom pass. Only fresh Google Trends leads are used.
 * Routine stories may publish when multiple independent source domains, complete
 * copy, duplicate checks and media validation pass. Sensitive/high-impact topics
 * are always held for an editor. Existing articles and account records are never
 * edited or deleted.
 */
async function run() {
  const config = await getConfig();
  if (!config.enabled) return { skipped: true, reason: 'Auto Manage is switched off.' };
  if (!geminiService.isConfigured()) {
    return saveRun(config, { researched: 0, drafted: 0, published: 0, duplicates: 0, held: 0, images: 0, videos: 0, notes: [{ error: 'Gemini is not configured.' }] });
  }

  const admin = config.ownerId
    ? await User.findOne({ _id: config.ownerId, role: 'ADMIN', isActive: true }).select('_id role').lean()
    : await User.findOne({ role: 'ADMIN', isActive: true }).select('_id role').lean();
  if (!admin || admin.role !== 'ADMIN') {
    return saveRun(config, { researched: 0, drafted: 0, published: 0, duplicates: 0, held: 0, images: 0, videos: 0, notes: [{ error: 'The active administrator account is unavailable.' }] });
  }

  const radar = await trendService.radar();
  const leads = radar.geos
    .filter((geo) => geo.ok && !geo.stale)
    .flatMap((geo) => geo.topics.slice(0, 5).map((topic) => ({ geo: geo.geo, topic: topic.topic, score: topic.score?.total || 0 })))
    .sort((a, b) => b.score - a.score);
  const categories = await Category.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  if (!categories.length) {
    return saveRun(config, { researched: leads.length, drafted: 0, published: 0, duplicates: 0, held: 0, images: 0, videos: 0, notes: [{ error: 'No active news categories are configured.' }] });
  }

  const result = { researched: leads.length, drafted: 0, published: 0, duplicates: 0, held: 0, images: 0, videos: 0, notes: [] };
  const used = new Set();
  for (const lead of leads) {
    if (result.drafted >= MAX_STORIES_PER_PASS) break;
    const key = lead.geo + ':' + lead.topic.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    try {
      const evidence = await trendService.evidenceFor(lead.geo, lead.topic);
      if (!evidence || !Array.isArray(evidence.headlines)) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, error: 'No source evidence was available.' });
        continue;
      }
      const sources = cleanSourceRows(evidence.headlines, admin._id);
      if (sources.length < MIN_DISTINCT_SOURCES) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, error: 'Held: fewer than two independent HTTPS publishers.' });
        continue;
      }

      const duplicate = await Article.findOne({
        aiGenerated: true,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
        $or: [{ title: new RegExp(lead.topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { 'sources.url': { $in: sources.map((item) => item.url) } }],
      }).select('_id').lean();
      if (duplicate) {
        result.duplicates += 1;
        continue;
      }

      const story = await geminiService.writeStory({
        topic: evidence.topic,
        audience: lead.geo === 'RW' ? 'rwanda' : 'world',
        region: evidence.region,
        evidence: evidence.headlines,
        angle: 'Write a careful, original, source-led news report. Attribute claims to the named publisher. Do not invent quotes, numbers, dates, names or details. Separate confirmed facts from allegations and explicitly disclose gaps or conflicting reports. Use only facts supported by the supplied sources.',
      });
      const title = String(story.title || '').trim().slice(0, 200);
      const summary = String(story.summary || '').trim().slice(0, 600);
      const content = String(story.content || '').trim();
      if (!title || !summary || !content) {
        result.held += 1;
        result.notes.push({ topic: lead.topic, error: 'AI returned incomplete article fields.' });
        continue;
      }

      // A trend publisher's photo is only attached after the existing image
      // verifier fetches it and confirms that it is a real, readable image.
      let photo = null;
      const photoCandidates = evidence.headlines.filter((item) => item.picture && item.source && item.url).map((item) => ({
        url: item.picture,
        credit: item.source,
        source: item.source,
        articleUrl: item.url,
        why: item.title || evidence.topic,
      }));
      if (photoCandidates.length) {
        try {
          const checked = await aiPhotoService.verify(photoCandidates, { limit: 3 });
          photo = checked.photos[0] || null;
          if (photo) {
            const original = photoCandidates.find((candidate) => candidate.url === photo.originalUrl || candidate.url === photo.url);
            photo.articleUrl = original?.articleUrl || '';
          }
        } catch (mediaError) {
          result.notes.push({ topic: lead.topic, error: `Image check unavailable; publishing without a photo: ${String(mediaError.message || mediaError).slice(0, 100)}` });
        }
      }

      // The Trends RSS currently supplies headline photos, not a dependable
      // video field. If a future source provides a video URL, normalize it with
      // the site's existing allow-list; never invent a clip or embed address.
      const videoCandidate = evidence.headlines.find((item) => item.videoUrl || item.video);
      const video = videoCandidate ? storyVideo.resolve(videoCandidate.videoUrl || videoCandidate.video) : null;
      const categoryText = (story.tags || []).join(' ').toLowerCase() + ' ' + title.toLowerCase();
      const category = categories.find((item) => categoryText.includes(String(item.name || '').toLowerCase())) || categories[0];
      const holdReason = qualityHoldReason({ lead, story: { ...story, title, summary, content }, sources });
      const slugBase = generateSlug(title) || 'radar-ai-story';
      const article = await Article.create({
        title,
        slug: `${slugBase}-${Date.now()}-${result.drafted + 1}`,
        summary,
        metaDescription: String(story.metaDescription || summary).slice(0, 200),
        content,
        author: admin._id,
        category: category._id,
        tags: (story.tags || []).slice(0, 6),
        language: 'en',
        country: evidence.region,
        aiGenerated: true,
        status: holdReason ? 'pending_review' : 'draft',
        featuredImage: photo?.url || undefined,
        imageCredit: photo?.credit || undefined,
        imageSourceUrl: photo?.articleUrl || photo?.pageUrl || undefined,
        imageCaption: photo ? String(photo.why || evidence.topic).slice(0, 240) : undefined,
        ...(video?.ok ? video.fields : {}),
        sources,
        reviewEvents: [{
          from: 'draft',
          to: holdReason ? 'pending_review' : 'draft',
          by: null,
          note: holdReason || 'RADAR AI generated a source-led story; automated quality checks passed.',
          at: new Date(),
        }],
      });

      result.drafted += 1;
      if (photo) result.images += 1;
      if (video?.ok && video.fields.videoUrl) result.videos += 1;

      if (holdReason) {
        result.held += 1;
        result.notes.push({ id: String(article._id), title: article.title, status: 'pending_review', error: holdReason });
        continue;
      }

      const published = await workflow.moveStory({
        article,
        to: 'published',
        by: admin._id,
        note: 'Published by RADAR Auto Manage after automated source, completeness, duplicate and media checks. AI-generated content; editorial monitoring remains required.',
      });
      if (!published.ok) {
        article.status = 'pending_review';
        article.reviewEvents.push({ from: 'draft', to: 'pending_review', by: null, note: `Automatic publication held: ${published.error}`, at: new Date() });
        await article.save();
        result.held += 1;
        result.notes.push({ id: String(article._id), title: article.title, status: 'pending_review', error: published.error });
        continue;
      }
      result.published += 1;
      result.notes.push({ id: String(article._id), title: article.title, category: category.name, status: 'published' });
    } catch (error) {
      result.held += 1;
      result.notes.push({ topic: lead.topic, error: String(error.message || error).slice(0, 180) });
    }
  }

  return saveRun(config, result);
}

module.exports = { getConfig, setEnabled, run };
