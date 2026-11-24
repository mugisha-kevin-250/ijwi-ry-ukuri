const express = require('express');
const { successResponse } = require('../utils/apiResponse');
const radioService = require('../services/radioService');
const audiusService = require('../services/audiusService');
const { Readable } = require('node:stream');

const router = express.Router();

/**
 * What is on the radio.
 *
 * One call answers the three questions the page has: which programme the timetable
 * put on air at this minute, when the next one starts, and which stories this
 * edition is actually carrying. The times come back both ways - the wall-clock the
 * admin wrote ("18:00") and the instant it means ("2026-11-14T16:00:00Z") - because
 * a reader counting down to the six o'clock needs the second one, and a reader
 * deciding whether six o'clock suits them needs the first.
 */
router.get('/timetable', async (req, res, next) => {
  try {
    const payload = await radioService.timetable({ now: new Date() });
    return successResponse(res, 200, 'Radio timetable', payload);
  } catch (error) {
    next(error);
  }
});


router.get('/audius/search', async (req, res, next) => {
  try { const query = String(req.query.q || '').trim(); if (query.length < 2) return successResponse(res, 200, 'Search Audius', { tracks: [] }); return successResponse(res, 200, 'Audius tracks', { tracks: await audiusService.search(query) }); }
  catch (error) { next(error); }
});
router.get('/audius/playlist', async (req, res, next) => {
  try { return successResponse(res, 200, 'RADAR radio playlist', { tracks: await audiusService.listStationTracks() }); }
  catch (error) { next(error); }
});
router.get('/audius/stream/:trackId', async (req, res, next) => {
  try {
    const trackId = String(req.params.trackId || '');
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(trackId)) return res.status(400).json({ success: false, message: 'Invalid Audius track ID' });
    const upstream = await audiusService.openStream(trackId, { range: req.headers.range });
    if ((!upstream.ok && upstream.status !== 206) || !upstream.body) return res.status(upstream.status === 404 ? 404 : 502).json({ success: false, message: 'Audius could not provide this track stream' });
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=300');
    for (const header of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) { const value = upstream.headers.get(header); if (value) res.set(header, value); }
    Readable.fromWeb(upstream.body).on('error', next).pipe(res);
  } catch (error) { next(error); }
});
module.exports = router;
