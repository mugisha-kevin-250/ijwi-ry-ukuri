const express = require('express');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const weatherService = require('../services/weatherService');

const router = express.Router();

/**
 * The weather desk.
 *
 * Two public reads, and the browser never learns that a weather company exists:
 * every call to the upstream is made by this server, once per city per few
 * minutes, and the answer is stored. That is what keeps a free monthly quota
 * enough for a whole readership, and what keeps the newsroom's key out of a
 * bundle anybody can download.
 *
 * The payload carries `stale`, `fetchedAt` and a `reason` alongside the numbers,
 * so the page can tell a reader in words how recently the sky was really looked
 * at instead of presenting a temperature it cannot stand behind.
 */

/** Is the desk connected at all, and when did it last hear from the source. */
router.get('/status', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Weather status', await weatherService.status());
  } catch (error) {
    return next(error);
  }
});

/**
 * One city: right now, today hour by hour, and three days ahead.
 *
 * `?q=` is whatever the reader typed - a town, "Kigali, Rwanda", or a pair of
 * coordinates. An empty `q` is the newsroom's own city, so the page has an answer
 * before anybody types anything.
 */
router.get('/', async (req, res, next) => {
  try {
    const payload = await weatherService.report({ q: req.query.q });
    if (payload.ok) {
      return successResponse(res, 200, 'Weather', payload);
    }
    // A city the source does not know is a 404 with a sentence the page can print;
    // anything else is our problem to report, and the last real reading still
    // travels with it so the page is not simply empty. The shared error helper
    // carries only a message, so this one answer is written out: the reading we
    // do have belongs in the body.
    if (payload.reason === 'CITY_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'No weather station answers for that place. Try a city name, or "City, Country".',
        data: payload,
      });
    }
    if (payload.reason === 'QUERY_TOO_LONG') {
      return errorResponse(res, 400, 'That is not a place we can look up.');
    }
    if (payload.reason === 'LOADING') {
      return successResponse(res, 202, 'Weather is being fetched', payload);
    }
    return successResponse(res, 200, 'Weather unavailable', payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
