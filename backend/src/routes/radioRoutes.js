const express = require('express');
const { successResponse } = require('../utils/apiResponse');
const radioService = require('../services/radioService');

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

module.exports = router;
