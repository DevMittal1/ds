require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const seedDB = require('./seed');

const User = require('./models/User');
const Problem = require('./models/Problem');
const Progress = require('./models/Progress');
const Settings = require('./models/Settings');

const app = express();

// Connect to MongoDB
connectDB().then(() => {
  // Run seeder to populate default DSA problems
  seedDB();
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth Middleware
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyfordstracker123!');
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      return next();
    } catch (error) {
      console.error('JWT verification error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }
};

// Date helpers
function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// -----------------------------------------------------------------
// AUTH API
// -----------------------------------------------------------------

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide both username and password' });
    }

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const user = await User.create({ username, password });
    
    // Create default settings for the user
    const today = new Date().toISOString().split('T')[0];
    await Settings.create({
      userId: user._id,
      planStart: today,
      dailyMinutes: 120
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecretjwtkeyfordstracker123!', {
      expiresIn: '30d'
    });

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide both username and password' });
    }

    const user = await User.findOne({ username });
    if (user && (await user.matchPassword(password))) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecretjwtkeyfordstracker123!', {
        expiresIn: '30d'
      });
      res.json({
        token,
        user: { id: user._id, username: user.username }
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', protect, async (req, res) => {
  res.json({ id: req.user._id, username: req.user.username });
});

// -----------------------------------------------------------------
// SETTINGS API
// -----------------------------------------------------------------

app.get('/api/settings', protect, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user._id });
    if (!settings) {
      const today = new Date().toISOString().split('T')[0];
      settings = await Settings.create({
        userId: req.user._id,
        planStart: today,
        dailyMinutes: 120
      });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/settings', protect, async (req, res) => {
  try {
    const { planStart, dailyMinutes } = req.body;
    let settings = await Settings.findOne({ userId: req.user._id });
    
    if (settings) {
      settings.planStart = planStart || settings.planStart;
      settings.dailyMinutes = dailyMinutes !== undefined ? Number(dailyMinutes) : settings.dailyMinutes;
      await settings.save();
    } else {
      settings = await Settings.create({
        userId: req.user._id,
        planStart: planStart || new Date().toISOString().split('T')[0],
        dailyMinutes: dailyMinutes !== undefined ? Number(dailyMinutes) : 120
      });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// -----------------------------------------------------------------
// PROBLEMS & PROGRESS COMBINED API
// -----------------------------------------------------------------

app.get('/api/problems', protect, async (req, res) => {
  try {
    // 1. Fetch all problems relevant to this user (pre-seeded + user-created custom ones)
    const problems = await Problem.find({
      $or: [
        { userId: null },
        { userId: req.user._id }
      ]
    }).sort({ order: 1, _id: 1 });

    // 2. Fetch all progress records for this user
    const progresses = await Progress.find({ userId: req.user._id });

    // Create a dictionary of progress entries mapping problemId -> progress details
    const progressMap = {};
    progresses.forEach(p => {
      progressMap[p.problemId.toString()] = p;
    });

    // 3. Assemble problems into weeks -> categories -> items structure
    const weeksMap = {};
    const weeksOrder = []; // To preserve insertion order of weeks

    problems.forEach(prob => {
      const weekName = prob.week;
      const catName = prob.category;
      
      if (!weeksMap[weekName]) {
        weeksMap[weekName] = { week: weekName, categoriesMap: {}, categoriesOrder: [] };
        weeksOrder.push(weekName);
      }

      const weekObj = weeksMap[weekName];
      if (!weekObj.categoriesMap[catName]) {
        weekObj.categoriesMap[catName] = { name: catName, items: [] };
        weekObj.categoriesOrder.push(catName);
      }

      const progress = progressMap[prob._id.toString()] || {};

      weekObj.categoriesMap[catName].items.push({
        id: prob._id,
        n: prob.name,
        est: prob.est,
        isCustom: prob.isCustom,
        done: progress.done || false,
        flagged: progress.flagged || false,
        expectedStart: progress.expectedStart || '',
        expectedEnd: progress.expectedEnd || '',
        estimatedMinutes: progress.estimatedMinutes !== undefined && progress.estimatedMinutes !== null ? progress.estimatedMinutes : prob.est,
        actualStartTs: progress.actualStartTs ? progress.actualStartTs.getTime() : null,
        completedTs: progress.completedTs ? progress.completedTs.getTime() : null,
        pseudocode: progress.pseudocode || '',
        solution: progress.solution || ''
      });
    });

    // Convert weeks maps into array structure matching the frontend expectations
    const result = weeksOrder.map(wkName => {
      const wkObj = weeksMap[wkName];
      const categories = wkObj.categoriesOrder.map(cName => {
        return wkObj.categoriesMap[cName];
      });
      return {
        week: wkName,
        categories
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Custom Problem
app.post('/api/problems/custom', protect, async (req, res) => {
  try {
    const { week, category, name, est } = req.body;
    if (!week || !category || !name) {
      return res.status(400).json({ message: 'Week, category, and name are required' });
    }

    // Determine order - place at end of existing custom problems
    const maxOrderDoc = await Problem.findOne({ userId: req.user._id }).sort({ order: -1 });
    const order = maxOrderDoc ? maxOrderDoc.order + 1 : 1000;

    const newProblem = await Problem.create({
      week,
      category,
      name,
      est: Number(est) || 20,
      isCustom: true,
      userId: req.user._id,
      order
    });

    res.status(201).json(newProblem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Custom Problem
app.delete('/api/problems/custom/:id', protect, async (req, res) => {
  try {
    const problem = await Problem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!problem) {
      return res.status(404).json({ message: 'Custom problem not found' });
    }
    
    // Delete progress for this problem
    await Progress.deleteMany({ problemId: req.params.id, userId: req.user._id });
    
    // Delete problem
    await Problem.deleteOne({ _id: req.params.id });
    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// -----------------------------------------------------------------
// PROGRESS TRACKING API
// -----------------------------------------------------------------

// Toggle Done
app.post('/api/progress/toggle', protect, async (req, res) => {
  try {
    const { problemId, done } = req.body;
    if (!problemId) {
      return res.status(400).json({ message: 'Problem ID is required' });
    }

    let progress = await Progress.findOne({ userId: req.user._id, problemId });
    
    const completedTs = done ? new Date() : null;

    if (progress) {
      progress.done = done;
      progress.completedTs = completedTs;
      await progress.save();
    } else {
      progress = await Progress.create({
        userId: req.user._id,
        problemId,
        done,
        completedTs
      });
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Start/Stop/Complete Timer
app.post('/api/progress/timer', protect, async (req, res) => {
  try {
    const { problemId, action } = req.body; // 'start', 'stop', 'complete'
    if (!problemId || !action) {
      return res.status(400).json({ message: 'Problem ID and Action are required' });
    }

    let progress = await Progress.findOne({ userId: req.user._id, problemId });
    if (!progress) {
      progress = new Progress({ userId: req.user._id, problemId });
    }

    if (action === 'start') {
      progress.actualStartTs = new Date();
      progress.completedTs = null;
      progress.done = false;
    } else if (action === 'stop') {
      progress.actualStartTs = null; // cancels/stops active timer without completion
    } else if (action === 'complete') {
      progress.completedTs = new Date();
      progress.done = true;
    }

    await progress.save();
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Save Pseudocode, Solution Code, Estimates, Dates
app.post('/api/progress/details', protect, async (req, res) => {
  try {
    const { problemId, expectedStart, expectedEnd, estimatedMinutes, pseudocode, solution } = req.body;
    if (!problemId) {
      return res.status(400).json({ message: 'Problem ID is required' });
    }

    let progress = await Progress.findOne({ userId: req.user._id, problemId });
    if (!progress) {
      progress = new Progress({ userId: req.user._id, problemId });
    }

    if (expectedStart !== undefined) progress.expectedStart = expectedStart;
    if (expectedEnd !== undefined) progress.expectedEnd = expectedEnd;
    if (estimatedMinutes !== undefined) progress.estimatedMinutes = estimatedMinutes !== '' ? Number(estimatedMinutes) : null;
    if (pseudocode !== undefined) progress.pseudocode = pseudocode;
    if (solution !== undefined) progress.solution = solution;

    await progress.save();
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Toggle Flag
app.post('/api/progress/flag', protect, async (req, res) => {
  try {
    const { problemId, flagged } = req.body;
    if (!problemId) {
      return res.status(400).json({ message: 'Problem ID is required' });
    }

    let progress = await Progress.findOne({ userId: req.user._id, problemId });
    if (progress) {
      progress.flagged = flagged;
      await progress.save();
    } else {
      progress = await Progress.create({
        userId: req.user._id,
        problemId,
        flagged
      });
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Auto-schedule generator
app.post('/api/settings/schedule', protect, async (req, res) => {
  try {
    const settings = await Settings.findOne({ userId: req.user._id });
    if (!settings) {
      return res.status(400).json({ message: 'Plan settings not found' });
    }

    const startVal = settings.planStart || new Date().toISOString().split('T')[0];
    const minutesPerDay = settings.dailyMinutes || 120;

    // Fetch all problems (both seeded and user custom)
    const problems = await Problem.find({
      $or: [
        { userId: null },
        { userId: req.user._id }
      ]
    }).sort({ order: 1, _id: 1 });

    // Fetch progress
    const progresses = await Progress.find({ userId: req.user._id });
    const progressMap = {};
    progresses.forEach(p => {
      progressMap[p.problemId.toString()] = p;
    });

    let cumulative = 0;
    let lastEndDayIdx = 0;
    let remaining = 0;
    let remainingMinutes = 0;

    const bulkOps = [];

    for (const prob of problems) {
      const prog = progressMap[prob._id.toString()] || {};
      
      // If completed, do not reschedule it
      if (prog.done) continue;

      const estMin = prog.estimatedMinutes !== undefined && prog.estimatedMinutes !== null ? prog.estimatedMinutes : prob.est;
      
      const startDayIdx = Math.floor(cumulative / minutesPerDay);
      cumulative += estMin;
      const endDayIdx = Math.floor((cumulative - 1) / minutesPerDay);

      const expectedStart = addDaysISO(startVal, startDayIdx);
      const expectedEnd = addDaysISO(startVal, endDayIdx);

      lastEndDayIdx = Math.max(lastEndDayIdx, endDayIdx);
      remaining++;
      remainingMinutes += estMin;

      // Update or create progress
      bulkOps.push({
        updateOne: {
          filter: { userId: req.user._id, problemId: prob._id },
          update: {
            $set: {
              expectedStart,
              expectedEnd,
              estimatedMinutes: estMin
            }
          },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await Progress.bulkWrite(bulkOps);
    }

    // Save summary meta in settings
    const finishDate = remaining > 0 ? addDaysISO(startVal, lastEndDayIdx) : startVal;
    
    res.json({
      message: 'Schedule generated successfully',
      summary: {
        remaining,
        remainingMinutes,
        totalDays: lastEndDayIdx + 1,
        finishDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Import entire state from exported JSON
app.post('/api/progress/import', protect, async (req, res) => {
  try {
    const { state: importedState, settings: importedSettings } = req.body;
    if (!importedState) {
      return res.status(400).json({ message: 'Import payload is missing state.' });
    }

    // importedState maps key (wIdx_cIdx_iIdx) to progress values in original structure
    // Since original structure was index-based, we'll map original pre-seeded problems to database IDs using their index ordering
    const problems = await Problem.find({ isCustom: false }).sort({ order: 1 });

    // Reconstruct key mapping: keyFor(wIdx, cIdx, iIdx) -> problemId
    // Let's mimic original data mapping
    const defaultProblemsLayout = [
      { weekIndex: 0, categories: [
        { name: "Two Pointers", count: 5 },
        { name: "Sliding Window", count: 5 }
      ]},
      { weekIndex: 1, categories: [
        { name: "Hashing", count: 6 },
        { name: "Stack", count: 6 }
      ]},
      { weekIndex: 2, categories: [
        { name: "Linked Lists", count: 7 }
      ]},
      { weekIndex: 3, categories: [
        { name: "Binary Search", count: 7 }
      ]},
      { weekIndex: 4, categories: [
        { name: "Trees", count: 13 }
      ]},
      { weekIndex: 5, categories: [
        { name: "Heap / Priority Queue", count: 5 },
        { name: "Backtracking", count: 6 }
      ]},
      { weekIndex: 6, categories: [
        { name: "Graphs", count: 10 }
      ]},
      { weekIndex: 7, categories: [
        { name: "1D DP", count: 8 },
        { name: "2D DP", count: 6 },
        { name: "Knapsack-style", count: 1 }
      ]},
      { weekIndex: 8, categories: [
        { name: "Greedy & Intervals", count: 7 }
      ]}
    ];

    let probPointer = 0;
    const keyToProblemId = {};

    defaultProblemsLayout.forEach((wk, wIdx) => {
      wk.categories.forEach((cat, cIdx) => {
        for (let iIdx = 0; iIdx < cat.count; iIdx++) {
          const key = `${wIdx}_${cIdx}_${iIdx}`;
          if (problems[probPointer]) {
            keyToProblemId[key] = problems[probPointer]._id;
            probPointer++;
          }
        }
      });
    });

    // Now delete all user's current progress
    await Progress.deleteMany({ userId: req.user._id });

    // Process and insert imported keys
    const progressDocs = [];
    Object.keys(importedState).forEach(key => {
      const probId = keyToProblemId[key];
      if (probId) {
        const item = importedState[key];
        progressDocs.push({
          userId: req.user._id,
          problemId: probId,
          done: item.done || false,
          flagged: item.flagged || false,
          expectedStart: item.expectedStart || '',
          expectedEnd: item.expectedEnd || '',
          estimatedMinutes: item.estimatedMinutes !== undefined && item.estimatedMinutes !== '' ? Number(item.estimatedMinutes) : null,
          actualStartTs: item.actualStartTs ? new Date(item.actualStartTs) : null,
          completedTs: item.completedTs ? new Date(item.completedTs) : null,
          pseudocode: item.pseudocode || '',
          solution: item.solution || ''
        });
      }
    });

    if (progressDocs.length > 0) {
      await Progress.insertMany(progressDocs);
    }

    // Save settings if imported
    if (importedSettings) {
      const planStart = importedSettings.startVal || importedSettings.planStart || new Date().toISOString().split('T')[0];
      const dailyMinutes = importedSettings.minutesPerDay || importedSettings.dailyMinutes || 120;
      
      await Settings.findOneAndUpdate(
        { userId: req.user._id },
        { planStart, dailyMinutes },
        { upsert: true }
      );
    }

    res.json({ message: 'Import completed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reset Profile/Progress/Custom Problems
app.post('/api/progress/reset', protect, async (req, res) => {
  try {
    await Progress.deleteMany({ userId: req.user._id });
    await Problem.deleteMany({ userId: req.user._id });
    await Settings.deleteOne({ userId: req.user._id });
    
    // Recreate default settings
    const today = new Date().toISOString().split('T')[0];
    await Settings.create({
      userId: req.user._id,
      planStart: today,
      dailyMinutes: 120
    });

    res.json({ message: 'Profile reset completed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Wildcard route to serve index.html for UI SPA routing (if any)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
