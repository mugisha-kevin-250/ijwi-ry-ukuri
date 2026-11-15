/**
 * The advertising desk.
 *
 * A space on this site is worth something only if a reader trusts what appears in
 * it, so the three rules here are about trust rather than about layout:
 *
 *   1. Nothing reaches a reader that a person has not published. A creative that
 *      comes from Gemini is stored as a draft with source 'ai' and the brief that
 *      produced it next to it; a human reads it and presses publish.
 *   2. A campaign is sold into a space for a window. Outside that window it is
 *      off the page by itself, without anyone remembering to take it down.
 *   3. The link an ad opens is a plain public https address. It is checked before
 *      it is stored, because an ad unit is the one place on the page a reader is
 *      expected to tap without reading the destination first.
 *
 * The click counter is the only number kept, and it counts a thing that actually
 * happened. There is no impression figure here because nothing on the page
 * measures whether a reader looked.
 */

const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const { publicHttpsUrl } = require('./urlGuard');
const { cleanText, plainText, safeMediaUrl } = require('../utils/textFields');

// The spaces on the site an advertisement can be sold into. They are named after
// where they are, and they are the whole list: `nav` is the strip above the
// section links that every public page carries, and the rest sit inside the story
// pages. There is no "leaderboard" here any more because there is no banner under
// the masthead any more - the top space moved into the header.
const PLACEMENTS = ['nav', 'list', 'articleInline', 'articleSidebar', 'newsRail'];
const STATUSES = ['draft', 'live', 'paused'];
const DEFAULT_PLACEMENT = 'nav';

const LIMITS = { advertiser: 80, headline: 120, body: 320, ctaLabel: 30, note: 400, brief: 1200 };

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

/** A colour the browser will accept, or none at all. Anything else is dropped:
 *  these values end up in a style attribute, so "not a hex colour" has to be a
 *  blank, not whatever the admin typed. */
function hexColor(value) {
  const color = String(value === undefined || value === null ? '' : value).trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split('').map((char) => char + char).join('').toLowerCase()}`;
  }
  return '';
}

function adLink(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) throw badRequest('The ad needs the link a reader goes to when they tap it');
  const checked = publicHttpsUrl(raw);
  if (!checked.ok) throw badRequest(`That link will not work in an ad: ${checked.reason}.`);
  return checked.url.toString().slice(0, 500);
}

function placementsFor(value, { defaulted = false } = {}) {
  const asked = (Array.isArray(value) ? value : [value])
    .map((item) => plainText(item, { maxLength: 24 }))
    .filter(Boolean);
  // Nothing chosen at all is only allowed when no one was asked - a campaign
  // saved before the space picker existed still has to run somewhere. An empty
  // or nonsense choice from the form is a mistake worth naming.
  if (!asked.length) {
    if (defaulted) return [DEFAULT_PLACEMENT];
    throw badRequest('Choose at least one space this ad runs in');
  }
  if (asked.includes('any')) return ['any'];
  const wanted = [...new Set(asked.filter((item) => PLACEMENTS.includes(item)))];
  if (!wanted.length) throw badRequest(`That is not a space on this site. Sell it into: ${PLACEMENTS.join(', ')}.`);
  return wanted;
}

/**
 * Normalise what the form (or the model) sent into something storable.
 *
 * Missing fields keep their previous value on an update, which is what lets the
 * publish button send a one-field patch without wiping the creative.
 */
function shape(input = {}, existing = null) {
  const previous = existing || {};
  const take = (key, limit, clean = plainText) =>
    input[key] === undefined ? clean(previous[key] || '', { maxLength: limit }) : clean(input[key], { maxLength: limit });

  const shaped = {
    advertiser: take('advertiser', LIMITS.advertiser),
    headline: take('headline', LIMITS.headline),
    body: take('body', LIMITS.body, (value, options) => cleanText(value, options)),
    ctaLabel: take('ctaLabel', LIMITS.ctaLabel),
    note: take('note', LIMITS.note),
    brief: take('brief', LIMITS.brief, (value, options) => cleanText(value, options)),
    link: input.link === undefined && previous.link ? adLink(previous.link) : adLink(input.link),
    image: input.image === undefined ? safeMediaUrl(previous.image || '') : safeMediaUrl(input.image),
    placements: placementsFor(input.placements === undefined ? previous.placements : input.placements, {
      defaulted: input.placements === undefined && !(previous.placements || []).length,
    }),
    priority: Number.isFinite(Number(input.priority)) ? Math.max(-100, Math.min(100, Math.round(Number(input.priority)))) : (previous.priority ?? 0),
    theme: {
      bg: hexColor(input.theme?.bg ?? previous.theme?.bg),
      fg: hexColor(input.theme?.fg ?? previous.theme?.fg),
      accent: hexColor(input.theme?.accent ?? previous.theme?.accent),
    },
  };

  if (!shaped.advertiser) throw badRequest('Say who the ad is from - a reader has to be able to tell whose promotion this is');
  if (!shaped.headline) throw badRequest('The ad needs a headline');
  if (!shaped.ctaLabel) shaped.ctaLabel = 'Learn more';

  const status = input.status === undefined
    ? (previous.status || 'draft')
    : (STATUSES.includes(input.status) ? input.status : null);
  if (!status) throw badRequest(`An ad is either ${STATUSES.join(', ')} - "${input.status}" is not one of those`);
  shaped.status = status;

  const date = (key) => {
    if (input[key] === undefined) return previous[key] || null;
    if (input[key] === null || input[key] === '') return null;
    const parsed = new Date(input[key]);
    if (Number.isNaN(parsed.getTime())) throw badRequest(`That ${key === 'startsAt' ? 'start' : 'end'} date is not a date we can read`);
    return parsed;
  };
  shaped.startsAt = date('startsAt');
  shaped.endsAt = date('endsAt');
  if (shaped.startsAt && shaped.endsAt && shaped.endsAt <= shaped.startsAt) {
    throw badRequest('The campaign ends before it starts');
  }

  // Who wrote the words. A creative that came from the model keeps that mark
  // through every later edit, so the desk can always see which campaigns started
  // as machine text; it is cleared only when someone says they rewrote it.
  shaped.source = input.source === 'ai' || input.source === 'desk'
    ? input.source
    : (previous.source || 'desk');
  shaped.model = input.model === undefined ? (previous.model || '') : plainText(input.model, { maxLength: 60 });

  return shaped;
}

/** What the desk reads: everything, in the order it will be decided in. */
async function list() {
  const ads = await Ad.find({})
    .sort({ status: 1, priority: -1, createdAt: -1 })
    .populate('createdBy updatedBy publishedBy', 'fullName username')
    .lean();
  return ads.map((ad) => ({
    ...ad,
    // Whether this campaign is on the page right now, as opposed to what its
    // status field says - an approved campaign outside its window is not running.
    isRunning: ad.status === 'live' && withinWindow(ad, new Date()),
  }));
}

function withinWindow(ad, now) {
  if (ad.startsAt && new Date(ad.startsAt) > now) return false;
  if (ad.endsAt && new Date(ad.endsAt) < now) return false;
  return true;
}

/** Whether a campaign was sold into this space, or into every space at once. */
function isBookedIn(ad, placement) {
  const places = ad.placements && ad.placements.length ? ad.placements : [DEFAULT_PLACEMENT];
  return places.includes('any') || places.includes(placement);
}

/**
 * Every space at once, so one request fills a whole page.
 *
 * The campaigns come back in the order they are decided in - highest priority
 * first, and on a tie whoever was published first - because two advertisers can
 * both be booked into a space and somebody has to lose. The answer only carries
 * spaces that have a campaign in them: a space nobody bought is reported as
 * nobody bought it, and the page prints its own offer there.
 */
async function activeForAll(places, now = new Date()) {
  const wanted = [...new Set(
    (Array.isArray(places) ? places : []).map((item) => (PLACEMENTS.includes(item) ? item : DEFAULT_PLACEMENT)),
  )];
  if (!wanted.length) return {};
  const live = await Ad.find({ status: 'live' })
    .sort({ priority: -1, publishedAt: -1, createdAt: -1 })
    .limit(200)
    .lean();
  const running = live.filter((ad) => withinWindow(ad, now));
  const byPlacement = {};
  wanted.forEach((place) => {
    const match = running.find((ad) => isBookedIn(ad, place));
    if (match) byPlacement[place] = match;
  });
  return byPlacement;
}

async function findById(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('That ad is not one we have');
  const ad = await Ad.findById(id).populate('createdBy updatedBy publishedBy', 'fullName username').lean();
  if (!ad) throw notFound('That ad is not one we have');
  return ad;
}

async function create(input, actorId) {
  const shaped = shape(input);
  const ad = await Ad.create({
    ...shaped,
    createdBy: actorId || null,
    updatedBy: actorId || null,
    publishedBy: shaped.status === 'live' ? actorId || null : null,
    publishedAt: shaped.status === 'live' ? new Date() : null,
  });
  return findById(ad._id);
}

async function update(id, input, actorId) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('That ad is not one we have');
  const existing = await Ad.findById(id);
  if (!existing) throw notFound('That ad is not one we have');

  const shaped = shape(input, existing.toObject());
  const wasLive = existing.status === 'live';
  Object.assign(existing, shaped);
  existing.updatedBy = actorId || existing.updatedBy;
  // Publishing is the moment a person took responsibility for the words, so it
  // is stamped and attributed when the campaign goes live. Re-publishing an
  // already-live edit keeps the original date - the window an advertiser bought
  // is not reset by fixing a typo.
  if (existing.status === 'live' && !existing.publishedAt) {
    existing.publishedAt = new Date();
    existing.publishedBy = actorId || existing.publishedBy;
  }
  if (!wasLive && existing.status === 'live') existing.publishedBy = actorId || existing.publishedBy;
  await existing.save();
  return findById(existing._id);
}

/**
 * Take a campaign off the page, or delete the record.
 *
 * Pausing is the normal answer - it keeps the click count and the history an
 * advertiser may come back and ask about. Deleting is refused while the campaign
 * is live, because an ad that vanishes from a page while someone is paying for it
 * looks like the site hid it.
 */
async function remove(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('That ad is not one we have');
  const ad = await Ad.findById(id);
  if (!ad) throw notFound('That ad is not one we have');
  if (ad.status === 'live') {
    const error = new Error('This campaign is running. Pause it first, then delete it if you really want the record gone.');
    error.status = 409;
    throw error;
  }
  await ad.deleteOne();
  return { deleted: true, name: ad.advertiser };
}

/**
 * One counted tap.
 *
 * Only a campaign that is on the page right now can be counted - otherwise a
 * stale creative left open in a reader's tab would keep a number climbing on a
 * space nobody is selling.
 */
async function countClick(id, now = new Date()) {
  if (!mongoose.isValidObjectId(id)) return null;
  const ad = await Ad.findOne({ _id: id, status: 'live' }).lean();
  if (!ad || !withinWindow(ad, now)) return null;
  await Ad.updateOne({ _id: id }, { $inc: { clicks: 1 } });
  return { link: ad.link };
}

module.exports = {
  PLACEMENTS,
  STATUSES,
  list,
  create,
  update,
  remove,
  findById,
  activeForAll,
  countClick,
  shape,
  withinWindow,
};
