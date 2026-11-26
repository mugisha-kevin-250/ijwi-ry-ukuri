const express = require('express');
const mongoose = require('mongoose');
const GlobalNewsItem = require('../models/GlobalNewsItem');
const Article = require('../models/Article');
const Category = require('../models/Category');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const service = require('../services/globalNewsService');
const geminiService = require('../services/geminiService');
const publisherArticleService = require('../services/publisherArticleService');
const generateSlug = require('../utils/generateSlug');
const { plainText, cleanText, cleanTags, safeMediaUrl } = require('../utils/textFields');
const auditLog = require('../services/auditLogService');

const router = express.Router();

// Public readers receive headlines, attribution and publisher links only. Feed
// leads are not silently converted into original RADAR reporting.
router.get('/', async (req, res, next) => {
  try {
    const result = await service.list({ page: req.query.page, limit: req.query.limit, region: req.query.region });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

router.get('/queue', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try {
    const result = await service.list({ page: req.query.page, limit: req.query.limit, status: 'unreviewed', includeReviewStatus: true });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

router.get('/status', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try { res.json({ success: true, ...(await service.status()) }); } catch (error) { next(error); }
});

router.post('/refresh', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try { res.json({ success: true, result: await service.refresh() }); } catch (error) { next(error); }
});

/**
 * A verified lead becomes an ORIGINAL English RADAR draft, never a live story.
 * The source's full article is not copied: the AI receives only its headline
 * and a short feed/API excerpt, and must keep missing facts visibly uncertain.
 * A unique Article.globalNewsLead plus the atomic review claim makes retries safe.
 */
router.post('/:id/review', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  let claimedLead = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'That is not a valid international lead.' });
    }
    const decision = String(req.body?.status || '');
    if (!['verified', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Choose verified or rejected.' });
    }
    const note = plainText(req.body?.note || '', { maxLength: 2000 });

    if (decision === 'rejected') {
      const rejected = await GlobalNewsItem.findOneAndUpdate(
        { _id: req.params.id, reviewStatus: 'unreviewed' },
        { $set: { reviewStatus: 'rejected', reviewedBy: req.user._id, reviewedAt: new Date(), editorNote: note } },
        { new: true, runValidators: true }
      ).select('-__v');
      if (!rejected) {
        const current = await GlobalNewsItem.findById(req.params.id).select('reviewStatus draftArticle');
        if (!current) return res.status(404).json({ success: false, message: 'News lead not found.' });
        return res.status(409).json({ success: false, message: 'This lead has already been reviewed or is being processed.' });
      }
      await auditLog.recordSafely({
        actor: req.user, action: 'global_news.lead_rejected', entityType: 'global_news_lead',
        entityId: rejected._id, entityLabel: rejected.title, summary: 'International news lead rejected',
        details: { source: rejected.sourceName }, req,
      });
      return res.json({ success: true, item: rejected, article: null, message: 'Lead rejected.' });
    }

    const existingLead = await GlobalNewsItem.findById(req.params.id);
    if (!existingLead) return res.status(404).json({ success: false, message: 'News lead not found.' });
    if (existingLead.reviewStatus === 'verified') {
      const existingArticle = existingLead.draftArticle
        ? await Article.findById(existingLead.draftArticle)
        : await Article.findOne({ globalNewsLead: existingLead._id });
      if (existingArticle) {
        return res.json({ success: true, item: existingLead, article: existingArticle, alreadyCreated: true, message: 'The RADAR draft already exists.' });
      }
      // Recover safely if the article was saved but the lead link was interrupted.
      const recovered = await Article.findOne({ globalNewsLead: existingLead._id });
      if (recovered) {
        existingLead.draftArticle = recovered._id;
        await existingLead.save();
        return res.json({ success: true, item: existingLead, article: recovered, alreadyCreated: true, message: 'The RADAR draft was recovered.' });
      }
      return res.status(409).json({ success: false, message: 'This lead is already verified. Contact an administrator to recover its missing draft link.' });
    }

    claimedLead = await GlobalNewsItem.findOneAndUpdate(
      { _id: req.params.id, reviewStatus: 'unreviewed' },
      { $set: { reviewStatus: 'reviewing', reviewedBy: req.user._id, reviewedAt: new Date(), editorNote: note } },
      { new: true }
    );
    if (!claimedLead) {
      const current = await GlobalNewsItem.findById(req.params.id).select('reviewStatus');
      return res.status(409).json({
        success: false,
        message: current?.reviewStatus === 'reviewing'
          ? 'This lead is already being turned into a draft. Refresh the desk in a moment.'
          : 'This lead has already been reviewed.',
      });
    }

    // Recover a previous attempt that created the Article but lost the final
    // lead update, instead of asking the model again or duplicating the draft.
    const recoveredDraft = await Article.findOne({ globalNewsLead: claimedLead._id });
    if (recoveredDraft) {
      claimedLead.reviewStatus = 'verified';
      claimedLead.englishTitle = recoveredDraft.title;
      claimedLead.draftArticle = recoveredDraft._id;
      claimedLead.draftCreatedAt = recoveredDraft.createdAt || new Date();
      await claimedLead.save();
      return res.json({ success: true, item: claimedLead, article: recoveredDraft, alreadyCreated: true, message: 'The existing RADAR draft was recovered.' });
    }

    if (!geminiService.isConfigured()) {
      const error = new Error('RADAR AI is not configured. Add GEMINI_API_KEY to the backend environment before creating international drafts.');
      error.status = 503;
      throw error;
    }

    const category = await Category.findOne({ slug: 'world', isActive: { $ne: false } });
    if (!category) {
      const error = new Error('The World category is missing. Restore the default World category before creating this draft.');
      error.status = 503;
      throw error;
    }

    // Reuse a previous successful extraction; otherwise retrieve the publisher's
    // publicly accessible article page. The extractor respects robots.txt,
    // rejects private-network targets, follows only a few HTTPS redirects and
    // never bypasses logins, paywalls or other access controls.
    let sourceResearch = claimedLead.sourceContent
      ? {
          status: claimedLead.extractionStatus || 'extracted',
          text: claimedLead.sourceContent,
          title: claimedLead.title,
          author: claimedLead.sourceAuthor || '',
          publishedAt: claimedLead.sourcePublishedAt || '',
          images: claimedLead.sourceImages || [],
          wordCount: claimedLead.sourceWordCount || claimedLead.sourceContent.split(/\s+/).length,
          extractedAt: claimedLead.sourceExtractedAt,
          reason: claimedLead.extractionNote || '',
        }
      : await publisherArticleService.fetchPublisherArticle(claimedLead.link);

    claimedLead.extractionStatus = sourceResearch.status || 'unavailable';
    claimedLead.extractionNote = sourceResearch.reason || '';
    if (sourceResearch.status === 'extracted') {
      claimedLead.sourceContent = String(sourceResearch.text || '').slice(0, 30000);
      claimedLead.sourceAuthor = sourceResearch.author || '';
      claimedLead.sourcePublishedAt = sourceResearch.publishedAt || '';
      claimedLead.sourceImages = (sourceResearch.images || []).slice(0, 12);
      claimedLead.sourceWordCount = sourceResearch.wordCount || 0;
      claimedLead.sourceExtractedAt = sourceResearch.extractedAt || new Date();
    }
    await claimedLead.save();

    const draft = await geminiService.writeGlobalNewsDraft({
      title: claimedLead.title,
      sourceTitle: sourceResearch.title || claimedLead.title,
      description: sourceResearch.description || claimedLead.description,
      sourceContent: sourceResearch.text || '',
      sourceAuthor: sourceResearch.author || '',
      sourcePublishedAt: sourceResearch.publishedAt || '',
      extractionStatus: sourceResearch.status || 'unavailable',
      sourceName: claimedLead.sourceName,
      sourceUrl: sourceResearch.url || claimedLead.link,
      region: claimedLead.region,
    });

    // Publisher-supplied images are references, not RADAR-owned assets. Keep
    // source links, captions and credits attached so an editor can verify reuse
    // permission before publication.
    const extractedImages = (sourceResearch.images || []).filter((entry) => safeMediaUrl(entry.url));
    const image = safeMediaUrl(extractedImages[0]?.url || claimedLead.imageUrl);
    const gallery = extractedImages.slice(image && extractedImages[0]?.url === image ? 1 : 0, 9)
      .map((entry) => ({
        kind: 'image',
        url: safeMediaUrl(entry.url),
        source: 'link',
        caption: plainText(entry.caption || 'Image supplied by the original publisher; verify reuse rights.', { maxLength: 300 }),
        credit: plainText(entry.credit || claimedLead.sourceName || 'Original publisher', { maxLength: 160 }),
      })).filter((entry) => entry.url);
    const sourceName = plainText(claimedLead.sourceName || 'Original publisher', { maxLength: 120 });
    const sourceLink = safeMediaUrl(claimedLead.link);
    const baseSlug = generateSlug(draft.title) || 'international-news';
    const article = await Article.create({
      title: plainText(draft.title, { maxLength: 200 }),
      slug: baseSlug + '-' + Date.now(),
      summary: cleanText(draft.summary, { maxLength: 600 }),
      metaDescription: plainText(draft.metaDescription, { maxLength: 200 }),
      content: cleanText(draft.content, { maxLength: 60000 }),
      featuredImage: image || '',
      imageCredit: image ? sourceName : '',
      imageCaption: image ? 'Image supplied by the original publisher. Confirm reuse rights before publication.' : '',
      imageSourceUrl: image ? (sourceLink || '') : '',
      media: gallery,
      sourceResearch: {
        extractionStatus: sourceResearch.status || 'unavailable',
        sourceWordCount: sourceResearch.wordCount || 0,
        sourceAuthor: sourceResearch.author || '',
        sourcePublishedAt: sourceResearch.publishedAt || '',
        extractedAt: sourceResearch.extractedAt || null,
        originalUrl: sourceResearch.url || claimedLead.link,
        usedFullSource: Boolean(draft.research?.usedFullSource),
      },
      author: req.user._id,
      category: category._id,
      tags: cleanTags(draft.tags, { max: 6 }),
      language: 'en',
      country: claimedLead.region || 'WORLD',
      aiGenerated: true,
      globalNewsLead: claimedLead._id,
      status: 'draft',
      sources: [{
        title: sourceResearch.title || claimedLead.title,
        organization: sourceName,
        url: safeMediaUrl(sourceResearch.url || claimedLead.link) || claimedLead.link,
        type: 'link',
        quote: '',
        accessedAt: new Date(),
        verificationStatus: 'pending',
        addedBy: req.user._id,
        reviewedBy: req.user._id,
      }],
      reviewEvents: [{
        from: 'new',
        to: 'draft',
        by: req.user._id,
        note: 'Original English draft generated from publisher research. Source claims and image rights require human editorial review.',
        at: new Date(),
      }],
    });

    claimedLead.reviewStatus = 'verified';
    claimedLead.englishTitle = article.title;
    claimedLead.draftArticle = article._id;
    claimedLead.draftCreatedAt = new Date();
    claimedLead.editorNote = note || 'Verified source lead. English RADAR draft generated; image reuse rights must be checked before publication.';
    await claimedLead.save();

    await auditLog.recordSafely({
      actor: req.user, action: 'global_news.draft_created', entityType: 'article',
      entityId: article._id, entityLabel: article.title,
      summary: 'English RADAR draft created from a verified international lead',
      details: { leadId: String(claimedLead._id), source: sourceName, hasImage: Boolean(image), extractionStatus: sourceResearch.status, sourceWordCount: sourceResearch.wordCount || 0, usedFullSource: Boolean(draft.research?.usedFullSource) }, req,
    });

    return res.status(201).json({
      success: true,
      message: draft.research?.usedFullSource\n        ? 'Publisher article researched and converted into a detailed original RADAR draft. It has not been published.'\n        : 'A limited-source RADAR draft was created because the publisher page did not expose its full article. Review the extraction note before publication.',\n      research: draft.research,\n      extractionNote: sourceResearch.reason || '',
      item: claimedLead,
      article,
      alreadyCreated: false,
    });
  } catch (error) {
    if (claimedLead) {
      await GlobalNewsItem.updateOne(
        { _id: claimedLead._id, reviewStatus: 'reviewing' },
        { $set: { reviewStatus: 'unreviewed', editorNote: 'Draft generation failed: ' + String(error.message || 'Unknown error').slice(0, 300) } }
      ).catch(() => {});
    }
    if (error.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ success: false, message: error.message });
    if (String(error.code || '').startsWith('AI_')) return res.status(502).json({ success: false, message: error.message });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
});

module.exports = router;
