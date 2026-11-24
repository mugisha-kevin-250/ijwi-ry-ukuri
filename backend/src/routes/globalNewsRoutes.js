const express = require('express');
const GlobalNewsItem = require('../models/GlobalNewsItem');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const service = require('../services/globalNewsService');

const router = express.Router();

// Public readers receive headlines, attribution and publisher links only. Feed
// leads are not silently converted into original RADAR reporting.
router.get('/', async (req, res, next) => {
  try {
    const result = await service.list({ page: req.query.page, limit: req.query.limit, region: req.query.region });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

router.get('/status', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try { res.json({ success: true, ...(await service.status()) }); } catch (error) { next(error); }
});
router.post('/refresh', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try { res.json({ success: true, result: await service.refresh() }); } catch (error) { next(error); }
});
router.patch('/:id/review', protect, requirePermission(PERMISSIONS.managePlatform), async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['unreviewed', 'reviewing', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Choose a valid review status.' });
    }
    const note = String(req.body.note || '').trim().slice(0, 2000);
    const item = await GlobalNewsItem.findByIdAndUpdate(req.params.id, {
      $set: { reviewStatus: status, reviewedBy: req.user._id, reviewedAt: new Date(), editorNote: note },
    }, { new: true, runValidators: true }).select('-__v');
    if (!item) return res.status(404).json({ success: false, message: 'News lead not found.' });
    res.json({ success: true, item });
  } catch (error) { next(error); }
});
module.exports = router;
