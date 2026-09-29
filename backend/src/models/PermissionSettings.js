const mongoose = require('mongoose');

// Singleton app settings: which device permissions are REQUIRED per role,
// plus the legal texts shown in the in-app permission gate.
// Admin edits everything from Admin → Permissions (GUI, no code changes).
const permissionSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'permissions', unique: true },
  required: {
    patient: {
      location: { type: Boolean, default: true },
      gallery: { type: Boolean, default: false },
      calling: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
      terms: { type: Boolean, default: true }
    },
    nurse: {
      location: { type: Boolean, default: true },
      gallery: { type: Boolean, default: true },
      calling: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
      terms: { type: Boolean, default: true }
    }
  },
  legal: {
    title: { type: String, default: 'Legal permission notice' },
    body: {
      type: String,
      default: 'Qarrib needs your permission to use location (live nurse/patient tracking), gallery/photos (service images & verification documents) and calling (contact nurse/patient on the registered number). On Android & iOS the system will ask you to Allow these permissions. You can change them anytime from the app Permissions screen or the system settings.'
    },
    updatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

permissionSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'permissions' });
  if (!doc) {
    doc = await this.create({ key: 'permissions' });
  }
  return doc;
};

module.exports = mongoose.model('PermissionSettings', permissionSettingsSchema);
