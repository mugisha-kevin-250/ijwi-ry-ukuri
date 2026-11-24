const mongoose = require('mongoose');

const assignmentEventSchema = new mongoose.Schema({
  action: { type: String, required: true, maxlength: 60 },
  note: { type: String, default: '', maxlength: 500 },
  from: String,
  to: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  brief: { type: String, required: true, trim: true, maxlength: 8000 },
  desk: { type: String, trim: true, maxlength: 80, default: 'General' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  status: {
    type: String,
    enum: ['assigned', 'accepted', 'in_progress', 'submitted', 'approved', 'changes_requested', 'cancelled'],
    default: 'assigned',
    index: true,
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dueAt: { type: Date, required: true, index: true },
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  submissionNote: { type: String, default: '', maxlength: 2000 },
  events: { type: [assignmentEventSchema], default: [] },
}, { timestamps: true });

assignmentSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
assignmentSchema.index({ status: 1, dueAt: 1 });

module.exports = mongoose.model('NewsroomAssignment', assignmentSchema);
