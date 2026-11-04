const mongoose = require('mongoose');

const writerWeeklyStatSchema = new mongoose.Schema({
  writerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  totalArticles: { type: Number, default: 0 },
  totalValidViews: { type: Number, default: 0 },
  totalLikes: { type: Number, default: 0 },
  totalComments: { type: Number, default: 0 },
  topArticle: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  calculatedReward: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

writerWeeklyStatSchema.index({ writerId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WriterWeeklyStat', writerWeeklyStatSchema);
