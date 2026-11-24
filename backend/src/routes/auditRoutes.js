const express = require('express');
const AuditLog = require('../models/AuditLog');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { successResponse } = require('../utils/apiResponse');
const { plainText } = require('../utils/textFields');
const escapeRegex = require('../utils/escapeRegex');

const router = express.Router();
router.use(protect, requirePermission([PERMISSIONS.viewNewsroomDesk]));

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    const action = plainText(req.query.action, { maxLength: 80 });
    const entityType = plainText(req.query.entityType, { maxLength: 40 });
    const search = plainText(req.query.search, { maxLength: 120 });

    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ summary: pattern }, { entityLabel: pattern }, { action: pattern }];
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'fullName username role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Newsroom activity fetched', {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
