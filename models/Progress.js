const mongoose = require('mongoose');

const ProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
  },
  done: {
    type: Boolean,
    default: false
  },
  flagged: {
    type: Boolean,
    default: false
  },
  expectedStart: {
    type: String,
    default: ''
  },
  expectedEnd: {
    type: String,
    default: ''
  },
  estimatedMinutes: {
    type: Number,
    default: null
  },
  actualStartTs: {
    type: Date,
    default: null
  },
  completedTs: {
    type: Date,
    default: null
  },
  pseudocode: {
    type: String,
    default: ''
  },
  solution: {
    type: String,
    default: ''
  }
});

// Compound index to ensure unique progress entry per user-problem pair
ProgressSchema.index({ userId: 1, problemId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', ProgressSchema);
