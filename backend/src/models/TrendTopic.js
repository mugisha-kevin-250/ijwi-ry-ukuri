const mongoose = require('mongoose');

/**
 * One search topic one provider reported for one region on one day, kept
 * because it is what the admin based a story on. Every field is copied from
 * the provider's own response - the traffic figure is Google's band, the
 * headlines are the ones Google credited - so a number in this collection can
 * always be traced back to the feed that printed it.
 */
const trendTopicSchema = new mongoose.Schema({
  provider: { type: String, required: true, default: 'google-trends' },
  geo: { type: String, required: true, uppercase: true, trim: true },
  day: { type: String, required: true },
  topic: { type: String, required: true, trim: true },
  trafficLabel: String,
  approxTraffic: Number,
  seenAt: Date,
  // The thumbnail Google printed for the trend, and the one each headline
  // carried. Kept because a story built on a trend should show the picture the
  // source published, not a random one.
  picture: String,
  newsItems: [{
    title: String,
    url: String,
    source: String,
    picture: String,
  }],
  sourceUrl: String,
  sightings: { type: Number, default: 1 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

trendTopicSchema.index({ provider: 1, geo: 1, topic: 1, day: 1 }, { unique: true });
trendTopicSchema.index({ day: -1, geo: 1, approxTraffic: -1 });

module.exports = mongoose.model('TrendTopic', trendTopicSchema);
