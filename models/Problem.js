const mongoose = require('mongoose');

const ProblemSchema = new mongoose.Schema({
  week: {
    type: String,
    required: [true, 'Please specify a week name'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Please specify a category name'],
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please specify a problem name'],
    trim: true
  },
  est: {
    type: Number,
    required: [true, 'Please specify estimated study minutes'],
    default: 20
  },
  order: {
    type: Number,
    default: 0
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

// A compound index to avoid identical problem definitions for a user/global
ProblemSchema.index({ userId: 1, week: 1, category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Problem', ProblemSchema);
