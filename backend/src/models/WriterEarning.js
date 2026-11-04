const mongoose = require('mongoose');

const writerEarningSchema = new mongoose.Schema({
  writerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  validViews: { type: Number, default: 0 },
  rewardRate: { type: Number, default: 5000 },
  calculatedAmount: { type: Number, default: 0 },
  approvedAmount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'paid'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date,
  paidAt: Date
}, { timestamps: true });

writerEarningSchema.index({ writerId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WriterEarning', writerEarningSchema);
