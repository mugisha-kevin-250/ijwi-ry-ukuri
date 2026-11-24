const express = require('express');
const mongoose = require('mongoose');
const Assignment = require('../models/NewsroomAssignment');
const User = require('../models/User');
const { protect, can } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { cleanText } = require('../utils/textFields');
const auditLog = require('../services/auditLogService');

const router = express.Router();
router.use(protect);

const STATES = ['assigned', 'accepted', 'in_progress', 'submitted', 'approved', 'changes_requested', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const isManager = (user) => can(user, PERMISSIONS.review);
const canWrite = (user) => can(user, PERMISSIONS.writeStories);

function event(action, by, from, to, note = '') {
  return { action, by: by._id, from, to, note: cleanText(note, { maxLength: 500 }), at: new Date() };
}

router.get('/assignees', async (req, res, next) => {
  try {
    if (!isManager(req.user)) return errorResponse(res, 403, 'Only the editorial desk can assign reporters');
    const users = await User.find({ isActive: true, role: { $in: ['WRITER', 'EDITOR', 'NEWS_EDITOR', 'MANAGING_EDITOR', 'ADMIN'] } })
      .select('fullName username email role').sort({ fullName: 1 }).lean();
    return successResponse(res, 200, 'Assignable newsroom members', { users });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    if (!isManager(req.user) && !canWrite(req.user)) return errorResponse(res, 403, 'You do not have access to newsroom assignments');
    const filter = isManager(req.user) ? {} : { assignedTo: req.user._id };
    if (STATES.includes(req.query.status)) filter.status = req.query.status;
    const assignments = await Assignment.find(filter)
      .sort({ dueAt: 1, createdAt: -1 }).limit(200)
      .populate('assignedTo', 'fullName username role')
      .populate('createdBy', 'fullName username role')
      .populate('article', 'title slug status').lean();
    return successResponse(res, 200, 'Assignments fetched', { assignments });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!isManager(req.user)) return errorResponse(res, 403, 'Only the editorial desk can create assignments');
    const title = cleanText(req.body?.title, { maxLength: 180 });
    const brief = cleanText(req.body?.brief, { maxLength: 8000 });
    const desk = cleanText(req.body?.desk || 'General', { maxLength: 80 });
    const assigneeId = String(req.body?.assignedTo || '');
    const dueAt = new Date(req.body?.dueAt);
    const priority = String(req.body?.priority || 'normal').toLowerCase();
    if (!title || !brief) return errorResponse(res, 400, 'A title and assignment brief are required');
    if (!mongoose.isValidObjectId(assigneeId)) return errorResponse(res, 400, 'Choose a valid reporter');
    if (Number.isNaN(dueAt.getTime())) return errorResponse(res, 400, 'Choose a valid deadline');
    if (dueAt.getTime() < Date.now() - 60000) return errorResponse(res, 400, 'The deadline must be in the future');
    if (!PRIORITIES.includes(priority)) return errorResponse(res, 400, 'Choose a valid priority');
    const assignee = await User.findOne({ _id: assigneeId, isActive: true, role: { $in: ['WRITER', 'EDITOR', 'NEWS_EDITOR', 'MANAGING_EDITOR', 'ADMIN'] } });
    if (!assignee || !canWrite(assignee)) return errorResponse(res, 400, 'That account cannot receive writing assignments');
    const assignment = await Assignment.create({
      title, brief, desk, priority, dueAt, assignedTo: assignee._id, createdBy: req.user._id,
      events: [event('created', req.user, '', 'assigned')],
    });
    const populated = await Assignment.findById(assignment._id)
      .populate('assignedTo', 'fullName username role').populate('createdBy', 'fullName username role').lean();
    await auditLog.recordSafely({
      actor: req.user, action: 'assignment.created', entityType: 'assignment', entityId: assignment._id,
      entityLabel: title, summary: `Assignment created for ${assignee.fullName}`,
      details: { assignedTo: String(assignee._id), priority, dueAt: dueAt.toISOString() }, req,
    });
    return successResponse(res, 201, 'Assignment created', { assignment: populated });
  } catch (error) { next(error); }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (!isManager(req.user)) return errorResponse(res, 403, 'Only the editorial desk can edit assignment details');
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid assignment');
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return errorResponse(res, 404, 'Assignment not found');
    const before = assignment.status;
    if (req.body?.title !== undefined) assignment.title = cleanText(req.body.title, { maxLength: 180 });
    if (req.body?.brief !== undefined) assignment.brief = cleanText(req.body.brief, { maxLength: 8000 });
    if (req.body?.desk !== undefined) assignment.desk = cleanText(req.body.desk, { maxLength: 80 });
    if (req.body?.priority !== undefined) {
      const priority = String(req.body.priority).toLowerCase();
      if (!PRIORITIES.includes(priority)) return errorResponse(res, 400, 'Invalid priority');
      assignment.priority = priority;
    }
    if (req.body?.dueAt !== undefined) {
      const dueAt = new Date(req.body.dueAt);
      if (Number.isNaN(dueAt.getTime())) return errorResponse(res, 400, 'Invalid deadline');
      assignment.dueAt = dueAt;
    }
    if (req.body?.assignedTo !== undefined) {
      if (!mongoose.isValidObjectId(String(req.body.assignedTo))) return errorResponse(res, 400, 'Invalid reporter');
      const assignee = await User.findOne({ _id: req.body.assignedTo, isActive: true });
      if (!assignee || !canWrite(assignee)) return errorResponse(res, 400, 'That account cannot receive writing assignments');
      assignment.assignedTo = assignee._id;
    }
    if (!assignment.title || !assignment.brief) return errorResponse(res, 400, 'Title and brief cannot be empty');
    assignment.events.push(event('updated', req.user, before, assignment.status, 'Assignment details updated'));
    await assignment.save();
    const populated = await Assignment.findById(assignment._id)
      .populate('assignedTo', 'fullName username role').populate('createdBy', 'fullName username role')
      .populate('article', 'title slug status').lean();
    await auditLog.recordSafely({
      actor: req.user, action: 'assignment.updated', entityType: 'assignment', entityId: assignment._id,
      entityLabel: assignment.title, summary: 'Assignment details updated', details: {}, req,
    });
    return successResponse(res, 200, 'Assignment updated', { assignment: populated });
  } catch (error) { next(error); }
});

router.put('/:id/status', async (req, res, next) => {
  try {
    if (!isManager(req.user) && !canWrite(req.user)) return errorResponse(res, 403, 'You cannot update this assignment');
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, 'Invalid assignment');
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return errorResponse(res, 404, 'Assignment not found');
    if (!isManager(req.user) && String(assignment.assignedTo) !== String(req.user._id)) {
      return errorResponse(res, 403, 'You can only update assignments assigned to you');
    }
    const nextStatus = String(req.body?.status || '').toLowerCase();
    if (!STATES.includes(nextStatus)) return errorResponse(res, 400, 'Choose a valid assignment status');
    const allowed = isManager(req.user)
      ? ['assigned', 'accepted', 'in_progress', 'submitted', 'approved', 'changes_requested', 'cancelled']
      : ['accepted', 'in_progress', 'submitted'];
    if (!allowed.includes(nextStatus)) return errorResponse(res, 403, 'Your role cannot set that assignment status');
    if (!isManager(req.user) && !['assigned', 'accepted', 'in_progress', 'changes_requested'].includes(assignment.status)) {
      return errorResponse(res, 409, 'This assignment is no longer open for reporter updates');
    }
    const previous = assignment.status;
    assignment.status = nextStatus;
    if (req.body?.submissionNote !== undefined) assignment.submissionNote = cleanText(req.body.submissionNote, { maxLength: 2000 });
    if (req.body?.article !== undefined) {
      if (req.body.article && !mongoose.isValidObjectId(String(req.body.article))) return errorResponse(res, 400, 'Invalid linked article');
      assignment.article = req.body.article || null;
    }
    assignment.events.push(event('status_changed', req.user, previous, nextStatus, req.body?.note));
    await assignment.save();
    const populated = await Assignment.findById(assignment._id)
      .populate('assignedTo', 'fullName username role').populate('createdBy', 'fullName username role')
      .populate('article', 'title slug status').lean();
    await auditLog.recordSafely({
      actor: req.user, action: 'assignment.status_changed', entityType: 'assignment', entityId: assignment._id,
      entityLabel: assignment.title, summary: `Assignment moved from ${previous} to ${nextStatus}`,
      details: { from: previous, to: nextStatus }, req,
    });
    return successResponse(res, 200, 'Assignment status updated', { assignment: populated });
  } catch (error) { next(error); }
});

module.exports = router;
