const express = require('express');
const Category = require('../models/Category');
const Article = require('../models/Article');
const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const Follow = require('../models/Follow');
const WriterProfile = require('../models/WriterProfile');
const { optionalAuth } = require('../middleware/auth');
const { withEngagement } = require('../services/engagementService');
const adService = require('../services/adService');
const translate = require('../services/translateService');
const { categoryIdsFor, sectionTree, sectionDocFor, sectionPathFor } = require('../utils/categoryGroups');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { cleanText, plainText } = require('../utils/textFields');

const escapeRegex = require('../utils/escapeRegex');

const router = express.Router();

// A reader can type anything into the search box, and every field of a story is
// scanned with it, so the term is treated as plain text and kept short.
function searchPattern(value) {
  return new RegExp(escapeRegex(String(value).slice(0, 80)), 'i');
}

router.get('/articles', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, category, sort = 'latest', language } = req.query;
    const filter = { status: 'published' };
    if (search) {
      const pattern = searchPattern(search);
      filter.$or = [{ title: pattern }, { summary: pattern }, { tags: { $in: [pattern] } }];
    }
    // The audio desk reads English stories only, and a story typed before the
    // language field existed IS an English story - it is the language the site
    // was written in - so a missing field has to count as a match.
    if (language) {
      const code = plainText(language).slice(0, 8).toLowerCase();
      filter.$and = [{ $or: [{ language: code }, { language: { $exists: false } }, { language: null }] }];
    }
    // A section asked for by slug has to include the copies stored under the
    // other language, otherwise "Sports" and "Amasport" each hide half the news.
    if (category) {
      const categoryIds = await categoryIdsFor(category);
      if (!categoryIds.length) {
        return successResponse(res, 200, 'Articles fetched', { articles: [], total: 0, page: Number(page), limit: Number(limit) });
      }
      filter.category = { $in: categoryIds };
    }
    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const articles = await Article.find(filter)
      .populate('author', 'fullName username')
      .populate('category', 'name slug')
      .sort(sortOption)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Article.countDocuments(filter);
    const decorated = await withEngagement(req.user, articles);
    return successResponse(res, 200, 'Articles fetched', { articles: await translate.forRequest(req, decorated), total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/articles/:slug', optionalAuth, async (req, res, next) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: 'published' })
      .populate('author', 'fullName username avatar')
      .populate('category', 'name slug');
    if (!article) return errorResponse(res, 404, 'Article not found');
    const [decorated] = await withEngagement(req.user, [article]);
    const [inLanguage] = await translate.forRequest(req, [decorated]);
    return successResponse(res, 200, 'Article fetched', { article: inLanguage });
  } catch (error) {
    next(error);
  }
});

router.get('/latest', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ publishedAt: -1 })
      .limit(10);
    return successResponse(res, 200, 'Latest articles', { articles: await translate.forRequest(req, articles) });
  } catch (error) {
    next(error);
  }
});

router.get('/trending', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ validViews: -1, likes: -1 })
      .limit(10);
    return successResponse(res, 200, 'Trending articles', { articles: await translate.forRequest(req, articles) });
  } catch (error) {
    next(error);
  }
});

router.get('/popular', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ views: -1 })
      .limit(10);
    return successResponse(res, 200, 'Popular articles', { articles: await translate.forRequest(req, articles) });
  } catch (error) {
    next(error);
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    return successResponse(res, 200, 'Categories fetched', { categories, sections: await sectionTree() });
  } catch (error) {
    next(error);
  }
});

// The header reads this on its own, without the whole category list.
router.get('/sections', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Sections fetched', { sections: await sectionTree() });
  } catch (error) {
    next(error);
  }
});

/**
 * A section page: /sports, or one sub-section of it: /sports/football.
 * Asking for a section also asks for everything filed under it, so a story the
 * writer put in Football appears on /sports as well as on its own page.
 */
router.get('/sections/:section/:child?', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = 'latest' } = req.query;
    const empty = { section: null, child: null, articles: [], total: 0, page: 1, limit: Number(limit) };
    const wanted = String(req.params.section || '').toLowerCase();
    const wantedChild = req.params.child ? String(req.params.child).toLowerCase() : null;

    const tree = await sectionTree();
    const section = tree.find((item) => item.slug === wanted);
    const child = section && wantedChild ? section.children.find((item) => item.slug === wantedChild) : null;
    if (!section || (wantedChild && !child)) {
      return successResponse(res, 200, 'Section articles fetched', empty);
    }

    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const sectionIds = await categoryIdsFor(child ? child.slug : section.slug);
    const filter = { category: { $in: sectionIds }, status: 'published' };
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .sort(sortOption)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit)),
      Article.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Section articles fetched', {
      section,
      child,
      category: await sectionDocFor(child ? child.slug : section.slug),
      articles: await translate.forRequest(req, await withEngagement(req.user, articles)),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/categories/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = 'latest' } = req.query;
    // Both copies of the section are read, so nothing published under the other
    // spelling disappears from this page, and a section only ever created in one
    // language still opens under its other name.
    const sectionIds = await categoryIdsFor(req.params.slug);
    const category = await sectionDocFor(req.params.slug);
    if (!category) {
      return successResponse(res, 200, 'Category articles fetched', { category: null, sectionPath: null, articles: [], total: 0, page: 1, limit });
    }

    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const inSection = { category: { $in: sectionIds.length ? sectionIds : [category._id] }, status: 'published' };

    const articles = await Article.find(inSection)
      .populate('author', 'fullName username avatar')
      .populate('category', 'name slug')
      .sort(sortOption)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Article.countDocuments(inSection);
    // The section address is the canonical one; this old /category/<slug> page
    // still works, and tells the reader where the section moved to.
    return successResponse(res, 200, 'Category articles fetched', { category, sectionPath: sectionPathFor(category.slug), articles: await translate.forRequest(req, await withEngagement(req.user, articles)), total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const regex = searchPattern(search);
    const articles = await Article.find({
      status: 'published',
      $or: [
        { title: regex },
        { summary: regex },
        { content: regex },
        { tags: { $in: [regex] } }
      ]
    }).populate('author', 'fullName username avatar').populate('category', 'name slug').sort({ publishedAt: -1 }).skip((Number(page)-1) * Number(limit)).limit(Number(limit));
    const authors = await User.find({
      $or: [
        { fullName: regex },
        { username: regex },
        { bio: regex }
      ]
    }).select('fullName username avatar bio role').limit(10);
    return successResponse(res, 200, 'Search results', { articles: await translate.forRequest(req, articles), authors });
  } catch (error) {
    next(error);
  }
});

/**
 * Every correction the newsroom has published, newest first.
 *
 * `/corrections` on the site promises that "a correction here names the story,
 * the date it was noticed, what was wrong" - and a correction recorded on one
 * story is otherwise only readable by a reader who already knows to open that
 * story. This is the index that makes the promise true.
 *
 * Only published stories are listed. The article route serves nothing else, so
 * anything else here would be a line with a dead link, and a transparency page
 * nobody can follow is decoration.
 */
router.get('/corrections', async (req, res, next) => {
  try {
    const rows = await Article.find({ status: 'published', 'corrections.0': { $exists: true } })
      .select('title slug publishedAt corrections')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const corrections = rows
      .map((row) => {
        const entries = (row.corrections || [])
          .slice()
          .sort((a, b) => new Date(b.at) - new Date(a.at));
        return {
          title: row.title,
          slug: row.slug,
          publishedAt: row.publishedAt,
          entries: entries.map((entry) => ({ note: entry.note, at: entry.at })),
          latestAt: entries.length ? entries[0].at : null,
        };
      })
      .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
      .slice(0, 50);

    return successResponse(res, 200, 'Corrections fetched', { corrections, total: corrections.length });
  } catch (error) {
    next(error);
  }
});

/**
 * The authors directory.
 *
 * Every byline on the site already links to `/user/<id>`, and that page exists,
 * but nothing collected those names into one place: a reader who wanted to know
 * who writes here had to stumble onto one story and click. This is that list.
 *
 * Who appears is decided by the work, not by a switch nobody set: an account
 * with at least one published story and not deactivated. Being approved to write
 * is about permission to submit; publishing is a human act in this newsroom, so
 * a name with stories under it is a name a reader is allowed to find - and an
 * account that has been turned off is not, whatever it published.
 *
 * The numbers are counted here, from the articles and the Follow rows, rather
 * than read off `WriterProfile.totalArticles`, which is a bookkeeping field and
 * drifts when a story is unpublished. A writer with no published story is not
 * in the list at all, so the page cannot offer an author card that opens on
 * nothing.
 */
router.get('/writers', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const sort = ['recent', 'stories', 'followers', 'name'].includes(req.query.sort) ? req.query.sort : 'stories';
    const query = plainText(req.query.q, { maxLength: 60 });

    const grouped = await Article.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$author',
          stories: { $sum: 1 },
          reads: { $sum: { $ifNull: ['$validViews', 0] } },
          lastPublished: { $max: { $ifNull: ['$publishedAt', '$createdAt'] } },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.isActive': { $ne: false } } },
    ]);

    // The typed name is matched in JavaScript rather than in the pipeline: the
    // list is one person per author, so it is small, and a regex pushed into the
    // aggregation would have to be built from reader input anyway.
    const needle = query.toLowerCase();
    const matched = needle
      ? grouped.filter((row) => `${row.account.fullName || ''} ${row.account.username || ''}`.toLowerCase().includes(needle))
      : grouped;

    const profileRows = await WriterProfile.find({ user: { $in: matched.map((row) => row._id) } })
      .select('user bio profileImage country status')
      .lean();
    const profileByUser = new Map(profileRows.map((profile) => [String(profile.user), profile]));

    const followers = await Follow.aggregate([
      { $match: { writer: { $in: profileRows.map((profile) => profile._id) } } },
      { $group: { _id: '$writer', followers: { $sum: 1 } } },
    ]);
    const followersByProfile = new Map(followers.map((row) => [String(row._id), row.followers]));

    const writers = matched.map((row) => {
      const profile = profileByUser.get(String(row._id));
      return {
        _id: String(row._id),
        fullName: row.account.fullName || (profile && profile.fullName) || 'RADAR writer',
        username: row.account.username || (profile && profile.username) || '',
        // The account's own line first: it is what the person set on the page
        // readers arrive at, and the application note is the fallback.
        bio: row.account.bio || (profile && profile.bio) || '',
        avatar: row.account.avatar || (profile && profile.profileImage) || '',
        country: row.account.country || (profile && profile.country) || '',
        stories: row.stories,
        reads: row.reads,
        followers: profile ? followersByProfile.get(String(profile._id)) || 0 : 0,
        lastPublished: row.lastPublished,
      };
    });

    const compare = {
      recent: (a, b) => new Date(b.lastPublished) - new Date(a.lastPublished) || b.stories - a.stories,
      stories: (a, b) => b.stories - a.stories || new Date(b.lastPublished) - new Date(a.lastPublished),
      followers: (a, b) => b.followers - a.followers || b.stories - a.stories,
      name: (a, b) => a.fullName.localeCompare(b.fullName),
    }[sort];
    writers.sort(compare);

    const start = (page - 1) * limit;
    return successResponse(res, 200, 'Writers fetched', {
      writers: writers.slice(start, start + limit),
      total: writers.length,
      page,
      limit,
      sort,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * The writers readers actually follow, counted from the Follow rows rather than
 * from any cached number, so the shelf cannot claim a following nobody gave.
 * A writer whose account is gone or who is no longer approved is left out.
 */
router.get('/writers/top', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 12);
    const ranked = await Follow.aggregate([
      { $group: { _id: '$writer', followers: { $sum: 1 } } },
      { $sort: { followers: -1, _id: 1 } },
      { $limit: limit },
    ]);
    const profiles = await WriterProfile.find({ _id: { $in: ranked.map((row) => row._id) }, status: 'approved' })
      .populate('user', 'fullName username bio avatar');
    const byProfile = new Map(profiles.map((profile) => [String(profile._id), profile]));
    const writers = ranked
      .map((row) => {
        const profile = byProfile.get(String(row._id));
        const account = profile && profile.user;
        if (!account) return null;
        return {
          _id: String(account._id),
          fullName: account.fullName || profile.fullName,
          username: account.username || profile.username,
          bio: profile.bio || account.bio || '',
          avatar: profile.profileImage || account.avatar || '',
          followers: row.followers,
        };
      })
      .filter(Boolean);
    return successResponse(res, 200, 'Top writers fetched', { writers });
  } catch (error) {
    next(error);
  }
});

router.get('/writers/:id', async (req, res, next) => {
  if (req.params.id === 'articles' || req.params.id === 'me' || req.params.id === 'dashboard' || req.params.id === 'earnings' || req.params.id === 'payouts') {
    return next();
  }
  try {
    const writer = await User.findById(req.params.id).select('fullName username bio avatar country language');
    const articles = await Article.find({ author: writer?._id, status: 'published' }).sort({ publishedAt: -1 });
    return successResponse(res, 200, 'Writer details', { writer, articles: await translate.forRequest(req, articles) });
  } catch (error) {
    next(error);
  }
});

const CONTACT_TOPICS = ['correction', 'story-tip', 'advertising', 'writer-access', 'other'];
// Enough of an address to reply to, not an RFC-compliant parser: a wrong one costs
// the reader a bounce letter, and a human-shaped check gives a human-shaped error.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/contact', async (req, res, next) => {
  try {
    // Bots fill every field they are given; a person never sees this one. The
    // answer is the same success as a real message, so a crawler cannot learn
    // which field to leave out and come back working.
    if (cleanText(req.body.website, { maxLength: 200 })) {
      return successResponse(res, 201, 'Message received');
    }

    const name = plainText(req.body.name, { maxLength: 120 });
    const email = plainText(req.body.email, { maxLength: 200 }).toLowerCase();
    // Optional, and asked for on the advertising page: a business that wants a
    // banner would rather talk than type, and a phone number nobody gave is worse
    // than none. Kept to digits, spaces and the shapes an international number
    // takes, so a stray paste cannot fill the field with a link.
    const phone = plainText(req.body.phone, { maxLength: 40 }).replace(/[^\d+\-()\s.]/g, '').trim();
    const message = cleanText(req.body.message, { maxLength: 4000 });
    const topic = CONTACT_TOPICS.includes(req.body.topic) ? req.body.topic : 'other';

    const problems = [];
    if (name.length < 2) problems.push('Please tell us who is writing.');
    if (!EMAIL_SHAPE.test(email)) problems.push('That email address is missing something, so we could not reply to it.');
    if (phone && phone.replace(/\D/g, '').length < 7) problems.push('That phone number looks too short to dial. Leave it blank if you would rather be answered by email.');
    if (message.length < 20) problems.push('Please add a little more detail, so the newsroom has something to work with.');
    if (problems.length) return errorResponse(res, 400, problems.join(' '));

    await ContactMessage.create({ name, email, phone, topic, message });
    return successResponse(res, 201, 'Message received');
  } catch (error) {
    next(error);
  }
});

/**
 * The advertising the newsroom sells itself.
 *
 * One request answers for every space on the page: the client sends the list of
 * placements it is about to draw and gets back the campaign booked into each one,
 * or nothing for the spaces that have no buyer. A space with no buyer stays a
 * space with no buyer - the site prints its own offer there rather than inventing
 * an advertiser, so an empty answer here is an honest answer.
 *
 * Nothing that is not live, and nothing outside its booked window, is in this
 * response. Drafts written by the model never reach a reader until a person
 * publishes them.
 */
router.get('/ads', async (req, res, next) => {
  try {
    const asked = String(req.query.placement || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const places = asked.length ? asked : adService.PLACEMENTS;
    const ads = await adService.activeForAll(places);
    // Only the fields a creative is printed from. The internal note about the
    // sale, who handled it and what the brief said stay on the desk.
    const shape = (ad) => ({
      _id: String(ad._id),
      advertiser: ad.advertiser,
      headline: ad.headline,
      body: ad.body,
      ctaLabel: ad.ctaLabel,
      link: ad.link,
      image: ad.image,
      theme: ad.theme,
    });
    return successResponse(res, 200, 'Advertisements', {
      ads: Object.fromEntries(Object.entries(ads).map(([place, ad]) => [place, shape(ad)])),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * One counted tap on one live ad.
 *
 * The reader's browser has already opened the link by the time this arrives, so a
 * failure here is invisible to them and costs the advertiser nothing but a number.
 * A click on a campaign that is not currently on the page is not counted and is
 * not an error - an ad left open in an old tab is a normal thing.
 */
router.post('/ads/:id/click', async (req, res, next) => {
  try {
    await adService.countClick(req.params.id);
    return successResponse(res, 200, 'Click counted');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
