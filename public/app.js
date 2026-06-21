let state = {
  token: localStorage.getItem('token') || null,
  currentUser: null,
  problemsData: [],
  settingsData: { planStart: '', dailyMinutes: 120 },
  activeTab: 'tracker',
  authTab: 'login',
  timerIntervals: {}
};

// Date helpers
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtDateShort(iso) {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h > 0 ? h + "h " : "") + m + "m " + sec + "s";
}

// Global loader toggle
function toggleLoader(show) {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    if (show) overlay.classList.add('active');
    else overlay.classList.remove('active');
  }
}

// Request helper
async function apiRequest(url, method = 'GET', body = null) {
  const headers = {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  };

  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        logout();
      }
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  } catch (error) {
    console.error(`API Error (${url}):`, error.message);
    throw error;
  }
}

// -----------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------

function switchAuthTab(tab) {
  state.authTab = tab;
  const loginHeader = document.getElementById('tabLogin');
  const registerHeader = document.getElementById('tabRegister');
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorMsg = document.getElementById('authError');
  
  errorMsg.textContent = '';
  
  if (tab === 'login') {
    loginHeader.classList.add('active');
    registerHeader.classList.remove('active');
    submitBtn.textContent = 'Sign In';
  } else {
    loginHeader.classList.remove('active');
    registerHeader.classList.add('active');
    submitBtn.textContent = 'Create Account';
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');
  const errorMsg = document.getElementById('authError');
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  
  if (!username || !password) return;
  
  toggleLoader(true);
  errorMsg.textContent = '';
  
  const endpoint = state.authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  
  try {
    const res = await apiRequest(endpoint, 'POST', { username, password });
    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('token', res.token);
    
    // Clear forms
    usernameInput.value = '';
    passwordInput.value = '';
    
    await initApp();
  } catch (err) {
    errorMsg.textContent = err.message;
  } finally {
    toggleLoader(false);
  }
}

function logout() {
  state.token = null;
  state.currentUser = null;
  state.problemsData = [];
  localStorage.removeItem('token');
  
  // Clear any running timers
  Object.keys(state.timerIntervals).forEach(k => clearInterval(state.timerIntervals[k]));
  state.timerIntervals = {};
  
  document.getElementById('authCard').style.display = 'block';
  document.getElementById('appWorkspace').style.display = 'none';
  document.getElementById('navAuth').innerHTML = '';
}

// Check logged in user profile on load
async function checkUserProfile() {
  if (!state.token) return false;
  try {
    const user = await apiRequest('/api/auth/me');
    state.currentUser = user;
    return true;
  } catch (err) {
    return false;
  }
}

// -----------------------------------------------------------------
// APPLICATION INITIALIZATION
// -----------------------------------------------------------------

async function initApp() {
  const hasProfile = await checkUserProfile();
  if (hasProfile && state.currentUser) {
    document.getElementById('authCard').style.display = 'none';
    document.getElementById('appWorkspace').style.display = 'block';
    
    // Draw user info in navbar
    const navAuth = document.getElementById('navAuth');
    navAuth.innerHTML = `
      <span class="user-tag">👤 ${state.currentUser.username}</span>
      <button class="btn" onclick="logout()">Logout</button>
    `;
    
    toggleLoader(true);
    try {
      await fetchSettings();
      await fetchProblems();
      setTimeout(() => checkReminders(false), 1000);
    } catch (err) {
      alert('Error fetching application data.');
    } finally {
      toggleLoader(false);
    }
  } else {
    logout();
  }
}

async function fetchSettings() {
  state.settingsData = await apiRequest('/api/settings');
  document.getElementById('planStart').value = state.settingsData.planStart || todayStr();
  document.getElementById('dailyMinutes').value = state.settingsData.dailyMinutes || 120;
}

async function fetchProblems() {
  state.problemsData = await apiRequest('/api/problems');
  renderProblemsList();
  renderDashboard();
}

// -----------------------------------------------------------------
// TABS & VIEWS SWITCHER
// -----------------------------------------------------------------

function switchView(viewName) {
  state.activeTab = viewName;
  
  // Update nav tabs classes
  document.getElementById('tabBtnTracker').classList.toggle('active', viewName === 'tracker');
  document.getElementById('tabBtnAddProblem').classList.toggle('active', viewName === 'add-problem');
  document.getElementById('tabBtnSettings').classList.toggle('active', viewName === 'settings');
  
  // Show/hide views
  document.getElementById('viewTracker').classList.toggle('active', viewName === 'tracker');
  document.getElementById('viewAddProblem').classList.toggle('active', viewName === 'add-problem');
  document.getElementById('viewSettings').classList.toggle('active', viewName === 'settings');
  
  // If returning to tracker, fetch fresh state
  if (viewName === 'tracker') {
    fetchProblems();
  }
}

// -----------------------------------------------------------------
// ROADMAP SCHEDULING
// -----------------------------------------------------------------

async function generateSchedule() {
  const planStart = document.getElementById('planStart').value;
  const dailyMinutes = parseInt(document.getElementById('dailyMinutes').value);
  
  toggleLoader(true);
  try {
    // 1. Save settings first
    await apiRequest('/api/settings', 'POST', { planStart, dailyMinutes });
    // 2. Trigger auto-scheduling
    const result = await apiRequest('/api/settings/schedule', 'POST');
    
    // Refresh settings and problems
    await fetchSettings();
    await fetchProblems();
    
    switchView('tracker');
  } catch (error) {
    alert(`Scheduling error: ${error.message}`);
  } finally {
    toggleLoader(false);
  }
}

// -----------------------------------------------------------------
// FRONTEND RENDERING
// -----------------------------------------------------------------

function renderDashboard() {
  let total = 0, solved = 0;
  let remainingMinutes = 0;
  let maxTargetEnd = '';

  state.problemsData.forEach(wk => {
    wk.categories.forEach(cat => {
      cat.items.forEach(item => {
        total++;
        if (item.done) {
          solved++;
        } else {
          remainingMinutes += Number(item.estimatedMinutes) || Number(item.est) || 20;
        }
        if (item.expectedEnd && item.expectedEnd > maxTargetEnd) {
          maxTargetEnd = item.expectedEnd;
        }
      });
    });
  });

  const remaining = total - solved;
  const dailyMinutes = state.settingsData.dailyMinutes || 120;
  const totalDays = Math.ceil(remainingMinutes / dailyMinutes);
  
  let projectedFinish = todayStr();
  if (maxTargetEnd) {
    projectedFinish = maxTargetEnd;
  } else if (totalDays > 0) {
    const d = new Date(state.settingsData.planStart + "T00:00:00");
    d.setDate(d.getDate() + totalDays);
    projectedFinish = d.toISOString().split('T')[0];
  }

  // Set counts
  document.getElementById('sumRemaining').textContent = remaining;
  document.getElementById('sumHours').textContent = (remainingMinutes / 60).toFixed(1) + "h";
  document.getElementById('sumDays').textContent = totalDays;
  document.getElementById('sumFinish').textContent = fmtDateShort(projectedFinish);

  // Set progress bar
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
  document.getElementById('progressBar').style.width = pct + "%";
  document.getElementById('progressText').textContent = `${solved} / ${total} solved (${pct}%)`;

  // Render warnings/alerts in alert box
  renderAlerts();
}

function renderAlerts() {
  const today = todayStr();
  const overdueList = [];
  const todayList = [];
  const flaggedList = [];

  state.problemsData.forEach(wk => {
    wk.categories.forEach(cat => {
      cat.items.forEach(item => {
        if (!item.done) {
          if (item.expectedEnd) {
            if (item.expectedEnd < today) overdueList.push(item.n);
            else if (item.expectedEnd === today) todayList.push(item.n);
          }
          if (item.flagged) {
            flaggedList.push(item.n);
          }
        }
      });
    });
  });

  const alertBox = document.getElementById('alertBox');
  let html = '';
  if (overdueList.length > 0) {
    html += `<div class="danger-line">⏰ Overdue problems list: ${overdueList.slice(0, 8).join(', ')}${overdueList.length > 8 ? ' + ' + (overdueList.length - 8) + ' more' : ''}</div>`;
  }
  if (todayList.length > 0) {
    html += `<div>📅 Due today: ${todayList.slice(0, 6).join(', ')}${todayList.length > 6 ? ' + ' + (todayList.length - 6) + ' more' : ''}</div>`;
  }
  if (flaggedList.length > 0) {
    html += `<div>🚩 Struggled / Flagged to revisit: ${flaggedList.slice(0, 6).join(', ')}${flaggedList.length > 6 ? ' + ' + (flaggedList.length - 6) + ' more' : ''}</div>`;
  }

  alertBox.innerHTML = html;
  alertBox.classList.toggle('show', html.length > 0);
}

function renderProblemsList() {
  const weeksEl = document.getElementById("weeks");
  const openedWeeks = weeksEl.dataset.openedWeeks ? JSON.parse(weeksEl.dataset.openedWeeks) : {};
  weeksEl.innerHTML = "";
  const today = todayStr();

  if (state.problemsData.length === 0) {
    weeksEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px;">No problems found. Click "Recalculate & Sync Dates" to generate schedule.</div>';
    return;
  }

  state.problemsData.forEach((wk, wIdx) => {
    let weekTotal = 0;
    let weekSolved = 0;
    let weekMaxEnd = "";

    // Count totals
    wk.categories.forEach(cat => {
      cat.items.forEach(item => {
        weekTotal++;
        if (item.done) weekSolved++;
        if (item.expectedEnd && item.expectedEnd > weekMaxEnd) weekMaxEnd = item.expectedEnd;
      });
    });

    const weekDiv = document.createElement("div");
    weekDiv.className = "week";

    const header = document.createElement("div");
    header.className = "week-header";
    header.innerHTML = `
      <div class="week-title-block">
        <div class="week-title">${wk.week}</div>
        <div class="week-target">${weekMaxEnd ? "Target completion: " + fmtDateShort(weekMaxEnd) : "No schedule generated"}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="week-count">${weekSolved}/${weekTotal}</span>
        <span class="chev ${openedWeeks[wIdx] ? 'open' : ''}">▶</span>
      </div>`;

    const body = document.createElement("div");
    body.className = `week-body ${openedWeeks[wIdx] ? 'open' : ''}`;

    wk.categories.forEach((cat, cIdx) => {
      const catDiv = document.createElement("div");
      catDiv.className = "category";
      
      const catName = document.createElement("div");
      catName.className = "category-name";
      catName.textContent = cat.name;
      catDiv.appendChild(catName);

      cat.items.forEach((item, iIdx) => {
        catDiv.appendChild(buildProblemItem(item, today, wk.week, cat.name));
      });
      body.appendChild(catDiv);
    });

    header.addEventListener("click", () => {
      const isOpen = body.classList.toggle("open");
      header.querySelector(".chev").classList.toggle("open");
      openedWeeks[wIdx] = isOpen;
      weeksEl.dataset.openedWeeks = JSON.stringify(openedWeeks);
    });

    weekDiv.appendChild(header);
    weekDiv.appendChild(body);
    weeksEl.appendChild(weekDiv);
  });
}

function buildProblemItem(item, today, weekName = '', categoryName = '') {
  const itemDiv = document.createElement("div");
  itemDiv.className = "item" + (item.done ? " checked" : "");

  const row = document.createElement("div");
  row.className = "item-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.addEventListener("click", ev => ev.stopPropagation());
  checkbox.addEventListener("change", async () => {
    toggleLoader(true);
    try {
      await apiRequest('/api/progress/toggle', 'POST', { problemId: item.id, done: checkbox.checked });
      await fetchProblems();
    } catch (err) {
      alert('Error updating status');
    } finally {
      toggleLoader(false);
    }
  });

  const nameSpan = document.createElement("div");
  nameSpan.className = "item-name";
  nameSpan.textContent = item.n;

  const badges = document.createElement("div");
  badges.style.display = "flex"; 
  badges.style.gap = "6px"; 
  badges.style.flexWrap = "wrap";

  if (item.expectedStart && item.expectedEnd && !item.done) {
    badges.innerHTML += `<span class="badge dates">${fmtDateShort(item.expectedStart)} → ${fmtDateShort(item.expectedEnd)}</span>`;
  }
  if (!item.done && item.expectedEnd) {
    if (item.expectedEnd < today) badges.innerHTML += `<span class="badge overdue">overdue</span>`;
    else if (item.expectedEnd === today) badges.innerHTML += `<span class="badge today">due today</span>`;
  }
  if (item.flagged) badges.innerHTML += `<span class="badge flagged">flagged</span>`;
  if (item.actualStartTs && !item.completedTs) badges.innerHTML += `<span class="badge" style="color:var(--accent);border-color:var(--accent);background:rgba(79,112,231,0.08);">in progress</span>`;
  if (item.isCustom) badges.innerHTML += `<span class="badge" style="color:#d946ef;border-color:#d946ef;background:rgba(217,70,239,0.05);">custom</span>`;

  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = "▶";

  row.appendChild(checkbox);
  row.appendChild(nameSpan);
  row.appendChild(badges);
  row.appendChild(chev);

  // DETAILS CONTAINER
  const details = document.createElement("div");
  details.className = "item-details";

  const grid = document.createElement("div");
  grid.className = "field-grid";
  grid.innerHTML = `
    <div class="field"><label>Expected Start</label><input type="date" data-f="expectedStart" value="${item.expectedStart}"></div>
    <div class="field"><label>Expected End</label><input type="date" data-f="expectedEnd" value="${item.expectedEnd}"></div>
    <div class="field"><label>Est Time (min)</label><input type="number" min="0" data-f="estimatedMinutes" value="${item.estimatedMinutes}"></div>
  `;
  grid.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("click", ev => ev.stopPropagation());
    inp.addEventListener("change", async () => {
      const field = inp.dataset.f;
      const val = inp.value;
      try {
        await apiRequest('/api/progress/details', 'POST', { problemId: item.id, [field]: val });
      } catch (e) {
        console.error(e);
      }
    });
  });

  // TIMER ROW
  const timerRow = document.createElement("div");
  timerRow.className = "timer-row";
  timerRow.addEventListener("click", ev => ev.stopPropagation());
  
  const timerDisplay = document.createElement("span");
  timerDisplay.className = "timer-display" + (item.completedTs ? " done" : "");
  timerDisplay.id = "timer_" + item.id;

  const startBtn = document.createElement("button");
  startBtn.className = "btn";
  const completeBtn = document.createElement("button");
  completeBtn.className = "btn success";
  completeBtn.textContent = "Mark Complete";

  function updateTimerButtons() {
    if (item.completedTs) {
      timerDisplay.textContent = "Time taken: " + fmtElapsed(item.completedTs - (item.actualStartTs || item.completedTs));
      startBtn.textContent = "Restart Timer";
      completeBtn.style.display = "none";
    } else if (item.actualStartTs) {
      startBtn.textContent = "Stop / Pause";
      completeBtn.style.display = "inline-block";
    } else {
      timerDisplay.textContent = "Not started";
      startBtn.textContent = "Start Timer";
      completeBtn.style.display = "none";
    }
  }
  updateTimerButtons();

  startBtn.addEventListener("click", async () => {
    toggleLoader(true);
    try {
      const action = (item.actualStartTs && !item.completedTs) ? 'stop' : 'start';
      await apiRequest('/api/progress/timer', 'POST', { problemId: item.id, action });
      if (state.timerIntervals[item.id]) {
        clearInterval(state.timerIntervals[item.id]);
        delete state.timerIntervals[item.id];
      }
      await fetchProblems();
    } catch (err) {
      alert('Error updating timer');
    } finally {
      toggleLoader(false);
    }
  });

  completeBtn.addEventListener("click", async () => {
    toggleLoader(true);
    try {
      await apiRequest('/api/progress/timer', 'POST', { problemId: item.id, action: 'complete' });
      if (state.timerIntervals[item.id]) {
        clearInterval(state.timerIntervals[item.id]);
        delete state.timerIntervals[item.id];
      }
      await fetchProblems();
    } catch (err) {
      alert('Error saving completed timer');
    } finally {
      toggleLoader(false);
    }
  });

  timerRow.appendChild(timerDisplay);
  timerRow.appendChild(startBtn);
  timerRow.appendChild(completeBtn);

  if (item.actualStartTs && !item.completedTs) {
    state.timerIntervals[item.id] = setInterval(() => {
      const disp = document.getElementById("timer_" + item.id);
      if (disp) {
        disp.textContent = "Elapsed: " + fmtElapsed(Date.now() - item.actualStartTs);
      }
    }, 1000);
  }

  // TEXTAREAS FOR CODE AND NOTES (Polished Editor-like UI Panels)
  const pseudoEditor = createEditorWrapper(
    "📝 Approach / Pseudocode",
    "e.g. Sort the array, use two pointers meeting at center...",
    item.pseudocode,
    async (val) => {
      await apiRequest('/api/progress/details', 'POST', { problemId: item.id, pseudocode: val });
    },
    'notes'
  );

  const solEditor = createEditorWrapper(
    "💻 Solution Code",
    "Paste your clean language solution here...",
    item.solution,
    async (val) => {
      await apiRequest('/api/progress/details', 'POST', { problemId: item.id, solution: val });
    },
    'code'
  );

  // FOOTER ACTIONS
  const footerRow = document.createElement("div");
  footerRow.style.display = "flex";
  footerRow.style.justifyContent = "space-between";
  footerRow.style.alignItems = "center";
  footerRow.style.marginTop = "14px";
  footerRow.addEventListener("click", ev => ev.stopPropagation());

  const flagBtn = document.createElement("button");
  flagBtn.className = "small-btn" + (item.flagged ? " flagged" : "");
  flagBtn.textContent = item.flagged ? "Unflag" : "Flag as struggled";
  flagBtn.addEventListener("click", async () => {
    toggleLoader(true);
    try {
      await apiRequest('/api/progress/flag', 'POST', { problemId: item.id, flagged: !item.flagged });
      await fetchProblems();
    } catch(err) {
      alert('Error updating flag');
    } finally {
      toggleLoader(false);
    }
  });

  const deleteBtn = document.createElement("button");
  if (item.isCustom) {
    deleteBtn.className = "small-btn";
    deleteBtn.style.color = "var(--danger)";
    deleteBtn.style.borderColor = "var(--danger)";
    deleteBtn.textContent = "Delete Problem";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to delete this custom problem?")) {
        toggleLoader(true);
        try {
          await apiRequest(`/api/problems/custom/${item.id}`, 'DELETE');
          await fetchProblems();
        } catch(e) {
          alert('Error deleting problem');
        } finally {
          toggleLoader(false);
        }
      }
    });
  }

  const completeSummary = document.createElement("span");
  completeSummary.className = "summary-line";
  completeSummary.textContent = item.completedTs ? "Completed: " + new Date(item.completedTs).toLocaleString() : "";

  const chatgptBtn = document.createElement("button");
  chatgptBtn.className = "small-btn";
  chatgptBtn.style.color = "#10a37f";
  chatgptBtn.style.borderColor = "rgba(16, 163, 127, 0.4)";
  chatgptBtn.style.backgroundColor = "rgba(16, 163, 127, 0.05)";
  chatgptBtn.innerHTML = `💬 Practice with ChatGPT`;
  chatgptBtn.addEventListener("mouseenter", () => {
    chatgptBtn.style.backgroundColor = "rgba(16, 163, 127, 0.15)";
    chatgptBtn.style.borderColor = "#10a37f";
  });
  chatgptBtn.addEventListener("mouseleave", () => {
    chatgptBtn.style.backgroundColor = "rgba(16, 163, 127, 0.05)";
    chatgptBtn.style.borderColor = "rgba(16, 163, 127, 0.4)";
  });
  chatgptBtn.addEventListener("click", () => {
    let promptText = `I am practicing Data Structures and Algorithms. Please act as a senior software engineering mentor and DSA coach.
I want to practice the problem "${item.n}" in the category "${categoryName}" (${weekName}).
Please:
1. Explain the core patterns, optimal time/space complexity, and common gotchas for this problem without immediately giving away the complete code.
2. Ask me questions about how I would approach this problem or what data structures I would use.
3. Let's discuss my pseudocode and step-by-step logic first, and then build up to a clean, optimal implementation.`;

    if (item.pseudocode && item.pseudocode.trim()) {
      promptText += `\n\nHere is my current approach/pseudocode:\n"""\n${item.pseudocode.trim()}\n"""\nCan you review this approach and let me know if it's correct and optimal?`;
    }
    if (item.solution && item.solution.trim()) {
      promptText += `\n\nHere is my current solution code:\n"""\n${item.solution.trim()}\n"""\nCan you check this code for correctness, time/space complexity, and clean code principles?`;
    }

    promptText += `\n\nLet's start!`;
    const url = `https://chatgpt.com/?q=${encodeURIComponent(promptText)}`;
    window.open(url, '_blank');
  });

  const footerActionLeft = document.createElement("div");
  footerActionLeft.style.display = "flex";
  footerActionLeft.style.gap = "8px";
  footerActionLeft.appendChild(flagBtn);
  footerActionLeft.appendChild(chatgptBtn);
  if (item.isCustom) {
    footerActionLeft.appendChild(deleteBtn);
  }

  footerRow.appendChild(footerActionLeft);
  footerRow.appendChild(completeSummary);

  // Assemble details
  details.appendChild(grid);
  details.appendChild(timerRow);
  details.appendChild(pseudoEditor);
  details.appendChild(solEditor);
  details.appendChild(footerRow);

  // Toggle detail container open/close
  row.addEventListener("click", () => {
    const isNowOpen = details.classList.toggle("open");
    chev.classList.toggle("open", isNowOpen);
  });

  itemDiv.appendChild(row);
  itemDiv.appendChild(details);
  return itemDiv;
}

// -----------------------------------------------------------------
// CUSTOM PROBLEMS
// -----------------------------------------------------------------

async function handleAddCustomProblem(event) {
  event.preventDefault();
  const week = document.getElementById('customWeek').value;
  const category = document.getElementById('customCategory').value.trim();
  const name = document.getElementById('customName').value.trim();
  const est = parseInt(document.getElementById('customEst').value) || 20;

  if (!week || !category || !name) return;

  toggleLoader(true);
  try {
    await apiRequest('/api/problems/custom', 'POST', { week, category, name, est });
    
    // Clear inputs
    document.getElementById('customCategory').value = '';
    document.getElementById('customName').value = '';
    document.getElementById('customEst').value = 25;
    
    alert('Custom problem added successfully!');
    // Redirect to tracker view
    switchView('tracker');
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    toggleLoader(false);
  }
}

// -----------------------------------------------------------------
// DESKTOP ALERTS / REMINDERS
// -----------------------------------------------------------------

document.getElementById("notifyBtn").addEventListener("click", () => {
  if (!("Notification" in window)) {
    alert("Notifications aren't supported in this browser.");
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === "granted") {
      new Notification("DSA Tracker", { body: "Reminders enabled successfully! You'll be notified of pending schedule milestones." });
      checkReminders(true);
    }
  });
});

document.getElementById("checkNowBtn").addEventListener("click", () => checkReminders(true));

function checkReminders(force) {
  const today = todayStr();
  const overdueNames = [];
  const todayNames = [];

  state.problemsData.forEach(wk => {
    wk.categories.forEach(cat => {
      cat.items.forEach(item => {
        if (!item.done && item.expectedEnd) {
          if (item.expectedEnd < today) overdueNames.push(item.n);
          else if (item.expectedEnd === today) todayNames.push(item.n);
        }
      });
    });
  });

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const lastCheck = localStorage.getItem('last_notify_check');
  if (!force && lastCheck === today) return;

  if (overdueNames.length > 0 || todayNames.length > 0) {
    let body = "";
    if (overdueNames.length > 0) {
      body += `Overdue milestones: ${overdueNames.slice(0, 3).join(", ")}${overdueNames.length > 3 ? " +" + (overdueNames.length - 3) : ""}. `;
    }
    if (todayNames.length > 0) {
      body += `Due today: ${todayNames.slice(0, 3).join(", ")}.`;
    }
    new Notification("DSA Tracker Milestone Reminder", { body });
    localStorage.setItem('last_notify_check', today);
  }
}

// Check reminders periodically
setInterval(() => checkReminders(false), 20 * 60 * 1000);

// -----------------------------------------------------------------
// RESET & EXPORT / IMPORT (Maintains full local compatibility)
// -----------------------------------------------------------------

document.getElementById("resetBtn").addEventListener("click", async () => {
  if (confirm("Reset ALL data? This will clear custom problems, settings, and timers. This CANNOT be undone.")) {
    toggleLoader(true);
    try {
      await apiRequest('/api/progress/reset', 'POST');
      localStorage.removeItem('last_notify_check');
      await initApp();
      switchView('tracker');
    } catch(err) {
      alert('Error resetting profile');
    } finally {
      toggleLoader(false);
    }
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  // Reconstruct localstorage structure keys
  const exportState = {};
  
  state.problemsData.forEach((wk, wIdx) => {
    wk.categories.forEach((cat, cIdx) => {
      cat.items.forEach((item, iIdx) => {
        const key = `${wIdx}_${cIdx}_${iIdx}`;
        exportState[key] = {
          done: item.done,
          flagged: item.flagged,
          expectedStart: item.expectedStart,
          expectedEnd: item.expectedEnd,
          estimatedMinutes: item.estimatedMinutes,
          actualStartTs: item.actualStartTs,
          completedTs: item.completedTs,
          pseudocode: item.pseudocode,
          solution: item.solution
        };
      });
    });
  });

  const exportObj = {
    state: exportState,
    settings: {
      startVal: state.settingsData.planStart,
      minutesPerDay: state.settingsData.dailyMinutes
    }
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dsa_tracker_progress_${state.currentUser.username}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", ev => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.state) {
        alert("Invalid export file structure.");
        return;
      }
      
      toggleLoader(true);
      await apiRequest('/api/progress/import', 'POST', parsed);
      await initApp();
      alert("Progress imported successfully from backup!");
    } catch(e) {
      alert("Error uploading file: " + e.message);
    } finally {
      toggleLoader(false);
    }
  };
  reader.readAsText(file);
});

// Initialize app on document load
window.addEventListener('DOMContentLoaded', initApp);

// Professional Code Editor Wrapper Creator
function createEditorWrapper(title, placeholder, value, onSave, editorType = 'code') {
  const container = document.createElement("div");
  container.className = "editor-wrapper " + (editorType === 'code' ? 'theme-code' : 'theme-notes');

  const header = document.createElement("div");
  header.className = "editor-header";

  const titleSpan = document.createElement("span");
  titleSpan.className = "editor-title";
  titleSpan.textContent = title;

  const actions = document.createElement("div");
  actions.className = "editor-actions";

  const status = document.createElement("span");
  status.className = "editor-status";
  status.textContent = "";

  const copyBtn = document.createElement("button");
  copyBtn.className = "editor-btn";
  copyBtn.textContent = "📋 Copy";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textarea.value);
    status.textContent = "Copied!";
    status.classList.add("visible");
    setTimeout(() => {
      status.classList.remove("visible");
    }, 2000);
  });

  actions.appendChild(status);
  actions.appendChild(copyBtn);
  header.appendChild(titleSpan);
  header.appendChild(actions);

  const textarea = document.createElement("textarea");
  textarea.className = "editor-textarea";
  textarea.placeholder = placeholder;
  textarea.value = value;
  textarea.addEventListener("click", ev => ev.stopPropagation());
  textarea.addEventListener("blur", async () => {
    status.textContent = "Saving...";
    status.classList.add("visible");
    try {
      await onSave(textarea.value);
      status.textContent = "Saved";
      setTimeout(() => {
        status.classList.remove("visible");
      }, 1500);
    } catch (e) {
      status.textContent = "Error saving";
    }
  });

  container.appendChild(header);
  container.appendChild(textarea);
  return container;
}
