const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  planStart: {
    type: String,
    default: ''
  },
  dailyMinutes: {
    type: Number,
    default: 120
  }
});

module.exports = mongoose.model('Settings', SettingsSchema);
