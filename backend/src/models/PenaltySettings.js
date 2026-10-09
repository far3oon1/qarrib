const mongoose = require('mongoose');

// Singleton penalty & rewards policy (admin-editable, no code changes):
//  - patient sudden-cancel tiers: time since request -> % deducted from held
//  - nurse lateness: arrived later than threshold after assignment -> % off
//  - on-time tips: patient may add a voluntary tip at rating time
const penaltySettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'penalties', unique: true },
  cancelTiers: [{
    withinMinutes: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 90 }
  }],
  nurseLateThresholdMinutes: { type: Number, default: 15, min: 1 },
  nurseLatePercent: { type: Number, default: 10, min: 0, max: 90 },
  tipEnabled: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

penaltySettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'penalties' });
  if (!doc) {
    doc = await this.create({
      key: 'penalties',
      cancelTiers: [
        { withinMinutes: 5, percent: 0 },
        { withinMinutes: 30, percent: 10 },
        { withinMinutes: 120, percent: 25 },
        { withinMinutes: 1000000, percent: 50 },
      ],
    });
  }
  // Keep tiers sorted so the first matching tier wins
  if (Array.isArray(doc.cancelTiers)) doc.cancelTiers.sort((a, b) => a.withinMinutes - b.withinMinutes);
  return doc;
};

penaltySettingsSchema.statics.cancelPercentFor = async function (minutesSince) {
  const doc = await this.getSingleton();
  const m = Number(minutesSince) || 0;
  for (const t of (doc.cancelTiers || [])) {
    if (m <= Number(t.withinMinutes)) return Number(t.percent) || 0;
  }
  return 0;
};

module.exports = mongoose.model('PenaltySettings', penaltySettingsSchema);
