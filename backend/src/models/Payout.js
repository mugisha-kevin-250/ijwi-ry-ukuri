const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  writerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  earningId: { type: mongoose.Schema.Types.ObjectId, ref: 'WriterEarning', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'RWF' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending'
  },
  paymentMethod: { type: String, default: 'bank_transfer' },
  paymentReference: String,
  requestedAt: { type: Date, default: Date.now },
  approvedAt: Date,
  paidAt: Date,
  rejectionReason: String
}, { timestamps: true });

payoutSchema.index({ writerId: 1, status: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
