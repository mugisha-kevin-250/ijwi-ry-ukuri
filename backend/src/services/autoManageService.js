const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const Category = require('../models/Category');
const User = require('../models/User');
const trendService = require('./trendService');
const geminiService = require('./geminiService');
const generateSlug = require('../utils/generateSlug');

const SETTING_KEY = 'radarAutoManage';
const MAX_DRAFTS_PER_PASS = 2;
const MIN_HEADLINES = 2;

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
    { $set: { key: SETTING_KEY, value, description: 'RADAR AI server-side newsroom automation; generated stories enter editorial review and never self-publish.' } },
    { upsert: true, new: true }
  );
  return getConfig();
}

/**
 * Server-side autonomous research pass. It deliberately creates editorial
 * review items only: it never approves writers, changes account permissions,
 * edits/deletes existing content, or publishes unverified machine copy.
 */
async function run() {
  const config = await getConfig();
  if (!config.enabled) return { skipped: true, reason: 'Auto Manage is switched off.' };
  if (!geminiService.isConfigured()) return { skipped: true, reason: 'Gemini is not configured.' };

  const admin = config.ownerId
    ? await User.findById(config.ownerId).select('_id role').lean()
    : await User.findOne({ role: 'ADMIN', isActive: true }).select('_id role').lean();
  if (!admin || admin.role !== 'ADMIN') {
    return { skipped: true, reason: 'The owner account is unavailable; no content was changed.' };
  }

  const radar = await trendService.radar();
  const leads = radar.geos
    .filter((geo) => geo.ok && !geo.stale)
    .flatMap((geo) => geo.topics.slice(0, 5).map((topic) => ({ geo: geo.geo, topic: topic.topic, score: topic.score?.total || 0 })))
    .sort((a, b) => b.score - a.score);
  const categories = await Category.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  if (!categories.length) return { skipped: true, reason: 'No active news categories are configured.' };

  const result = { researched: leads.length, drafted: 0, duplicates: 0, held: 0, notes: [] };
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
        continue;
      }
      const urls = evidence.headlines.map((item) => item.url).filter((url) => /^https:\/\//i.test(url));
      if (urls.length < MIN_HEADLINES) {
        result.held += 1;
        continue;
      }
      const duplicate = await Article.findOne({
        aiGenerated: true,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
        $or: [{ title: new RegExp(lead.topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { 'sources.url': { $in: urls } }],
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
        angle: 'Write a careful, original, source-led report. Attribute claims to the named source, distinguish confirmed facts from claims, do not invent quotes, numbers, dates or details, and explicitly state when evidence is limited.',
      });
      const lower = (story.tags || []).join(' ').toLowerCase() + ' ' + story.title.toLowerCase();
      const category = categories.find((item) => lower.includes(String(item.name || '').toLowerCase())) || categories[0];
      const title = String(story.title || '').trim().slice(0, 200);
      if (!title || !story.content || !story.summary) {
        result.held += 1;
        continue;
      }
      const slugBase = generateSlug(title) || 'radar-ai-story';
      const article = await Article.create({
        title,
        slug: `${slugBase}-${Date.now()}-${result.drafted + 1}`,
        summary: String(story.summary).slice(0, 600),
        metaDescription: String(story.metaDescription || story.summary).slice(0, 200),
        content: story.content,
        author: admin._id,
        category: category._id,
        tags: (story.tags || []).slice(0, 6),
        language: 'en',
        country: evidence.region,
        aiGenerated: true,
        status: 'pending_review',
        sources: evidence.headlines.filter((item) => /^https:\/\//i.test(item.url)).slice(0, 8).map((item) => ({
          title: item.title,
          organization: item.source || 'Source listed by Google Trends',
          url: item.url,
          type: 'link',
          verificationStatus: 'pending',
          addedBy: admin._id,
          at: new Date(),
        })),
        reviewEvents: [{ from: 'draft', to: 'pending_review', by: null, note: 'RADAR AI Auto Manage created a research draft; editorial verification is required before publication.', at: new Date() }],
      });
      result.drafted += 1;
      result.notes.push({ id: String(article._id), title: article.title, category: category.name, status: article.status });
    } catch (error) {
      result.held += 1;
      result.notes.push({ topic: lead.topic, error: String(error.message || error).slice(0, 180) });
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

module.exports = { getConfig, setEnabled, run };
