const express = require('express');
const mongoose = require('mongoose');
const MusicArtist = require('../models/MusicArtist');
const MusicRelease = require('../models/MusicRelease');
const MusicPlaylist = require('../models/MusicPlaylist');
const MusicListen = require('../models/MusicListen');
const { protect, can } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { cleanText } = require('../utils/textFields');
const auditLog = require('../services/auditLogService');

const router = express.Router();
const isMusicManager = user => can(user, PERMISSIONS.manageMusic);
const cleanUrl = value => {
  const text = cleanText(value, { maxLength: 500 });
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
};

// Public catalogue contains only releases explicitly approved by the RADAR desk.
router.get('/releases', async (req, res, next) => {
  try {
    const filter = { status: 'approved' };
    if (req.query.featured === 'true') filter.featured = true;
    const releases = await MusicRelease.find(filter).select('title description genre language artworkUrl listeningUrl featured reviewedAt artist').sort({ featured: -1, reviewedAt: -1 }).limit(60)
      .populate({ path: 'artist', match: { status: 'verified' }, select: 'stageName biography country genres officialUrl' }).lean();
    return successResponse(res, 200, 'Approved RADAR music releases', { releases: releases.filter(item => item.artist) });
  } catch (error) { next(error); }
});

// Listening counts are recorded against approved releases only; the audio remains at its official provider.
router.post('/releases/:id/listen', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid release');
    const release = await MusicRelease.findOneAndUpdate({ _id: req.params.id, status: 'approved' }, { $inc: { plays: 1 } }, { new: true }).select('_id plays');
    if (!release) return errorResponse(res, 404, 'Approved release not found');
    return successResponse(res, 200, 'Listening event recorded', { plays: release.plays });
  } catch (error) { next(error); }
});

router.get('/charts', async (req, res, next) => {
  try {
    const releases = await MusicRelease.find({ status: 'approved' }).select('title genre artworkUrl listeningUrl plays reviewedAt artist')
      .sort({ plays: -1, reviewedAt: -1 }).limit(30)
      .populate({ path: 'artist', match: { status: 'verified' }, select: 'stageName country' }).lean();
    return successResponse(res, 200, 'RADAR music charts', { releases: releases.filter(item => item.artist) });
  } catch (error) { next(error); }
});

// Private listening history belongs to the signed-in account.
router.post('/history/:releaseId', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.releaseId)) return errorResponse(res, 400, 'Invalid release');
    const release = await MusicRelease.findOne({ _id: req.params.releaseId, status: 'approved' }).select('_id');
    if (!release) return errorResponse(res, 404, 'Approved release not found');
    await MusicListen.create({ release: release._id, user: req.user._id });
    return successResponse(res, 201, 'Listening history saved');
  } catch (error) { next(error); }
});

router.get('/history/me', protect, async (req, res, next) => {
  try {
    const history = await MusicListen.find({ user: req.user._id }).sort({ listenedAt: -1 }).limit(100)
      .populate({ path: 'release', match: { status: 'approved' }, populate: { path: 'artist', match: { status: 'verified' }, select: 'stageName' } }).lean();
    return successResponse(res, 200, 'Your listening history', { history: history.filter(item => item.release && item.release.artist) });
  } catch (error) { next(error); }
});

// A reader can only manage their own playlists. Public playlists expose approved tracks only.
router.get('/playlists/me', protect, async (req, res, next) => {
  try {
    const playlists = await MusicPlaylist.find({ user: req.user._id }).sort({ updatedAt: -1 })
      .populate({ path: 'releases', match: { status: 'approved' }, populate: { path: 'artist', match: { status: 'verified' }, select: 'stageName' } }).lean();
    return successResponse(res, 200, 'Your music playlists', { playlists });
  } catch (error) { next(error); }
});

router.post('/playlists', protect, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, { maxLength: 80 });
    if (!name) return errorResponse(res, 400, 'Playlist name is required');
    const playlist = await MusicPlaylist.create({ user: req.user._id, name, description: cleanText(req.body?.description, { maxLength: 300 }) });
    return successResponse(res, 201, 'Playlist created', { playlist });
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 409, 'You already have a playlist with that name');
    next(error);
  }
});

router.put('/playlists/:id/tracks', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid playlist');
    const ids = Array.isArray(req.body?.releaseIds) ? [...new Set(req.body.releaseIds.map(String))].slice(0, 100) : null;
    if (!ids || ids.some(id => !mongoose.isValidObjectId(id))) return errorResponse(res, 400, 'Provide valid release IDs');
    const approved = await MusicRelease.find({ _id: { $in: ids }, status: 'approved' }).select('_id');
    if (approved.length !== ids.length) return errorResponse(res, 400, 'Playlists can contain approved releases only');
    const playlist = await MusicPlaylist.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { releases: ids }, { new: true, runValidators: true })
      .populate({ path: 'releases', populate: { path: 'artist', select: 'stageName' } });
    if (!playlist) return errorResponse(res, 404, 'Playlist not found');
    return successResponse(res, 200, 'Playlist updated', { playlist });
  } catch (error) { next(error); }
});

router.delete('/playlists/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid playlist');
    const playlist = await MusicPlaylist.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!playlist) return errorResponse(res, 404, 'Playlist not found');
    return successResponse(res, 200, 'Playlist deleted');
  } catch (error) { next(error); }
});

// An authenticated reader can apply for an artist profile. One profile per account.
router.post('/artists/apply', protect, async (req, res, next) => {
  try {
    const stageName = cleanText(req.body?.stageName, { maxLength: 100 });
    if (!stageName) return errorResponse(res, 400, 'A stage or artist name is required');
    const existing = await MusicArtist.findOne({ user: req.user._id });
    if (existing) return errorResponse(res, 409, 'An artist profile already exists for this account');
    const genres = Array.isArray(req.body?.genres) ? req.body.genres.slice(0, 8).map(value => cleanText(value, { maxLength: 40 })).filter(Boolean) : [];
    const officialUrl = cleanUrl(req.body?.officialUrl);
    if (req.body?.officialUrl && !officialUrl) return errorResponse(res, 400, 'Enter a valid official HTTPS or HTTP profile URL');
    const artist = await MusicArtist.create({
      user: req.user._id, stageName, biography: cleanText(req.body?.biography, { maxLength: 2000 }),
      country: cleanText(req.body?.country, { maxLength: 80 }), genres, officialUrl,
    });
    await auditLog.recordSafely({ actor: req.user, action: 'music.artist_application', entityType: 'music_artist', entityId: artist._id, entityLabel: stageName, summary: 'Artist profile application submitted', req });
    return successResponse(res, 201, 'Artist application submitted for review', { artist });
  } catch (error) { next(error); }
});

router.get('/artists/me', protect, async (req, res, next) => {
  try {
    const artist = await MusicArtist.findOne({ user: req.user._id }).lean();
    const releases = artist ? await MusicRelease.find({ artist: artist._id }).sort({ createdAt: -1 }).lean() : [];
    return successResponse(res, 200, 'Your RADAR artist workspace', { artist, releases });
  } catch (error) { next(error); }
});

router.patch('/artists/me', protect, async (req, res, next) => {
  try {
    const artist = await MusicArtist.findOne({ user: req.user._id });
    if (!artist) return errorResponse(res, 404, 'Artist profile not found');
    const allowed = ['stageName', 'biography', 'country', 'genres', 'officialUrl'];
    const changes = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) changes[key] = req.body[key];
    if (changes.stageName !== undefined) {
      changes.stageName = cleanText(changes.stageName, { maxLength: 100 });
      if (!changes.stageName) return errorResponse(res, 400, 'Artist name cannot be empty');
    }
    if (changes.biography !== undefined) changes.biography = cleanText(changes.biography, { maxLength: 2000 });
    if (changes.country !== undefined) changes.country = cleanText(changes.country, { maxLength: 80 });
    if (changes.genres !== undefined) changes.genres = Array.isArray(changes.genres) ? changes.genres.slice(0, 8).map(value => cleanText(value, { maxLength: 40 })).filter(Boolean) : [];
    if (changes.officialUrl !== undefined) {
      changes.officialUrl = cleanUrl(changes.officialUrl);
      if (req.body.officialUrl && !changes.officialUrl) return errorResponse(res, 400, 'Official URL must be a valid HTTP or HTTPS URL');
    }
    Object.assign(artist, changes);
    await artist.save();
    await auditLog.recordSafely({ actor: req.user, action: 'music.artist_profile_updated', entityType: 'music_artist', entityId: artist._id, entityLabel: artist.stageName, summary: 'Artist profile details updated', req });
    return successResponse(res, 200, 'Artist profile updated', { artist });
  } catch (error) { next(error); }
});

router.post('/releases', protect, async (req, res, next) => {
  try {
    const artist = await MusicArtist.findOne({ user: req.user._id, status: 'verified' });
    if (!artist) return errorResponse(res, 403, 'A verified RADAR artist profile is required before submitting music');
    const title = cleanText(req.body?.title, { maxLength: 160 });
    const listeningUrl = cleanUrl(req.body?.listeningUrl);
    const rightsBasis = String(req.body?.rightsBasis || '');
    if (!title || !listeningUrl) return errorResponse(res, 400, 'A release title and valid listening URL are required');
    if (!['owner', 'written_permission', 'licensed'].includes(rightsBasis)) return errorResponse(res, 400, 'Choose how you have the rights to submit this release');
    if (req.body?.rightsDeclaration !== true) return errorResponse(res, 400, 'You must confirm the rights declaration');
    const artworkUrl = cleanUrl(req.body?.artworkUrl);
    const rightsEvidenceUrl = cleanUrl(req.body?.rightsEvidenceUrl);
    if (['written_permission', 'licensed'].includes(rightsBasis) && !rightsEvidenceUrl) return errorResponse(res, 400, 'Provide a URL to the written permission or licence evidence');
    if (req.body?.rightsEvidenceUrl && !rightsEvidenceUrl) return errorResponse(res, 400, 'Rights evidence URL must be a valid HTTP or HTTPS URL');
    if (req.body?.artworkUrl && !artworkUrl) return errorResponse(res, 400, 'Artwork URL must be a valid HTTP or HTTPS URL');
    const release = await MusicRelease.create({
      artist: artist._id, submittedBy: req.user._id, title,
      description: cleanText(req.body?.description, { maxLength: 1500 }),
      genre: cleanText(req.body?.genre, { maxLength: 60 }), language: cleanText(req.body?.language, { maxLength: 40 }),
      artworkUrl, listeningUrl, rightsBasis, rightsDeclaration: true, rightsEvidenceUrl,
      // Download permission is never granted by an artist checkbox; the rights desk must approve it.
      downloadAllowed: false,
    });
    await auditLog.recordSafely({ actor: req.user, action: 'music.release_submitted', entityType: 'music_release', entityId: release._id, entityLabel: title, summary: 'Music release submitted for rights review', req });
    return successResponse(res, 201, 'Release submitted for editorial and rights review', { release });
  } catch (error) { next(error); }
});

router.post('/releases/:id/takedown', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid release');
    const release = await MusicRelease.findById(req.params.id).populate('artist', 'user stageName');
    if (!release) return errorResponse(res, 404, 'Release not found');
    if (!isMusicManager(req.user) && String(release.artist?.user) !== String(req.user._id)) return errorResponse(res, 403, 'Only the submitting artist or RADAR rights desk can request removal');
    if (!['approved', 'pending'].includes(release.status)) return errorResponse(res, 409, 'This release is already under review or removed');
    const reason = cleanText(req.body?.reason, { maxLength: 1500 });
    if (!reason) return errorResponse(res, 400, 'A reason for the takedown request is required');
    release.status = 'takedown_pending';
    release.takedownReason = reason;
    release.featured = false;
    await release.save();
    await auditLog.recordSafely({ actor: req.user, action: 'music.takedown_requested', entityType: 'music_release', entityId: release._id, entityLabel: release.title, summary: 'Music release takedown requested', req });
    return successResponse(res, 200, 'Takedown request sent to the RADAR rights desk', { release });
  } catch (error) { next(error); }
});

// All review and download-right decisions are restricted to the owner/admin permission.
router.get('/desk/queue', protect, async (req, res, next) => {
  try {
    if (!isMusicManager(req.user)) return errorResponse(res, 403, 'RADAR music desk access required');
    const [artists, releases] = await Promise.all([
      MusicArtist.find({ status: 'pending' }).populate('user', 'fullName email username').sort({ createdAt: 1 }).lean(),
      MusicRelease.find({ status: { $in: ['pending', 'takedown_pending'] } }).populate({ path: 'artist', populate: { path: 'user', select: 'fullName email username' } }).sort({ createdAt: 1 }).lean(),
    ]);
    return successResponse(res, 200, 'Music rights review queue', { artists, releases });
  } catch (error) { next(error); }
});

router.get('/desk/catalogue', protect, async (req, res, next) => {
  try {
    if (!isMusicManager(req.user)) return errorResponse(res, 403, 'RADAR music desk access required');
    const status = ['pending', 'approved', 'rejected', 'takedown_pending', 'removed'].includes(String(req.query.status)) ? String(req.query.status) : null;
    const filter = status ? { status } : {};
    const [artists, releases] = await Promise.all([
      MusicArtist.find({}).populate('user', 'fullName email username').sort({ updatedAt: -1 }).limit(250).lean(),
      MusicRelease.find(filter).populate({ path: 'artist', select: 'stageName status user', populate: { path: 'user', select: 'email username' } }).sort({ updatedAt: -1 }).limit(500).lean(),
    ]);
    return successResponse(res, 200, 'Music management catalogue', { artists, releases });
  } catch (error) { next(error); }
});

router.put('/desk/artists/:id/review', protect, async (req, res, next) => {
  try {
    if (!isMusicManager(req.user)) return errorResponse(res, 403, 'RADAR music desk access required');
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid artist');
    const status = String(req.body?.status || '');
    if (!['verified', 'rejected', 'suspended'].includes(status)) return errorResponse(res, 400, 'Invalid artist decision');
    const artist = await MusicArtist.findByIdAndUpdate(req.params.id, { status, reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: cleanText(req.body?.note, { maxLength: 1000 }) }, { new: true, runValidators: true });
    if (!artist) return errorResponse(res, 404, 'Artist not found');
    await auditLog.recordSafely({ actor: req.user, action: 'music.artist_reviewed', entityType: 'music_artist', entityId: artist._id, entityLabel: artist.stageName, summary: 'Artist application reviewed', details: { status }, req });
    return successResponse(res, 200, 'Artist application reviewed', { artist });
  } catch (error) { next(error); }
});

router.put('/desk/releases/:id/review', protect, async (req, res, next) => {
  try {
    if (!isMusicManager(req.user)) return errorResponse(res, 403, 'RADAR music desk access required');
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid release');
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected', 'removed'].includes(status)) return errorResponse(res, 400, 'Invalid release decision');
    const release = await MusicRelease.findById(req.params.id);
    if (!release) return errorResponse(res, 404, 'Release not found');
    if (status === 'approved') {
      const artist = await MusicArtist.findById(release.artist).select('status');
      if (!artist || artist.status !== 'verified') return errorResponse(res, 409, 'The artist must be verified before a release can be approved');
    }
    release.status = status;
    release.reviewedBy = req.user._id;
    release.reviewedAt = new Date();
    release.reviewNote = cleanText(req.body?.note, { maxLength: 1000 });
    release.featured = status === 'approved' && req.body?.featured === true;
    // Direct downloads remain disabled unless the rights desk records affirmative permission.
    release.downloadAllowed = false; // No RADAR-hosted audio or private rights-document store exists yet; never enable direct downloads from a checkbox.
    await release.save();
    await auditLog.recordSafely({ actor: req.user, action: 'music.release_reviewed', entityType: 'music_release', entityId: release._id, entityLabel: release.title, summary: 'Music release rights decision recorded', details: { status, featured: release.featured, downloadAllowed: release.downloadAllowed }, req });
    return successResponse(res, 200, 'Release review saved', { release });
  } catch (error) { next(error); }
});

module.exports = router;
