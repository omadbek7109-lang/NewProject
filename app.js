/* =========================================================
   TON EARNINGS TRACKER — APP LOGIC
   Vanilla JS, no framework. All data persisted to LocalStorage.
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     0. CONSTANTS & STORAGE KEYS
     --------------------------------------------------------- */
  const STORAGE_KEY = 'ton_tracker_data_v1';
  const GROUP_COLORS = ['#3B9EFF', '#7A5CFF', '#33D17A', '#FFB340', '#FF5C7A', '#20D9C6', '#FF8A3D', '#5C7CFF'];
  const MILESTONES = [1, 10, 50, 100]; // TON thresholds that trigger confetti

  const DEFAULT_DATA = {
    groups: [],       // { id, name, accounts, description, color }
    entries: [],      // { id, date, groupId, amount, notes }
    settings: {
      tonPriceUZS: 33000,
      currency: 'UZS',
      darkMode: true
    },
    meta: {
      unlockedMilestones: [], // which milestones already triggered confetti
      lastEntryDate: null     // for streak calc cache (not strictly needed but handy)
    }
  };

  /* ---------------------------------------------------------
     1. STATE
     --------------------------------------------------------- */
  let state = loadData();
  let charts = {}; // holds active chart animation handles so we can cancel/redraw
  let pendingDeleteAction = null; // callback for confirm modal

  /* ---------------------------------------------------------
     2. STORAGE HELPERS
     --------------------------------------------------------- */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      // merge with defaults to be safe against missing fields on upgrade
      return {
        groups: parsed.groups || [],
        entries: parsed.entries || [],
        settings: Object.assign({}, DEFAULT_DATA.settings, parsed.settings || {}),
        meta: Object.assign({}, DEFAULT_DATA.meta, parsed.meta || {})
      };
    } catch (e) {
      console.error('Failed to load data, resetting.', e);
      return structuredClone(DEFAULT_DATA);
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------
     3. DATE HELPERS
     --------------------------------------------------------- */
  function todayISO() {
    const d = new Date();
    return isoFromDate(d);
  }
  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function formatDatePretty(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatDateShort(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
  function daysBetween(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00');
    const b = new Date(isoB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function addDaysISO(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return isoFromDate(d);
  }

  /* ---------------------------------------------------------
     4. CORE COMPUTED STATS
     --------------------------------------------------------- */
  function totalEarned() {
    return state.entries.reduce((sum, e) => sum + e.amount, 0);
  }

  function earnedToday() {
    const t = todayISO();
    return state.entries.filter(e => e.date === t).reduce((s, e) => s + e.amount, 0);
  }

  function activeDayCount() {
    const days = new Set(state.entries.map(e => e.date));
    return days.size;
  }

  function averagePerDay() {
    const days = activeDayCount();
    if (days === 0) return 0;
    return totalEarned() / days;
  }

  function highestDay() {
    const map = {};
    state.entries.forEach(e => { map[e.date] = (map[e.date] || 0) + e.amount; });
    let best = { date: null, amount: 0 };
    Object.entries(map).forEach(([date, amount]) => {
      if (amount > best.amount) best = { date, amount };
    });
    return best;
  }

  function lowestDay() {
    const map = {};
    state.entries.forEach(e => { map[e.date] = (map[e.date] || 0) + e.amount; });
    let worst = { date: null, amount: Infinity };
    Object.entries(map).forEach(([date, amount]) => {
      if (amount < worst.amount) worst = { date, amount };
    });
    if (worst.date === null) worst.amount = 0;
    return worst;
  }

  function totalAccounts() {
    return state.groups.reduce((s, g) => s + (Number(g.accounts) || 0), 0);
  }

  function averagePerAccount() {
    const acc = totalAccounts();
    if (acc === 0) return 0;
    return totalEarned() / acc;
  }

  function averagePerGroup() {
    if (state.groups.length === 0) return 0;
    return totalEarned() / state.groups.length;
  }

  function estimatedMonthly() {
    return averagePerDay() * 30;
  }

  function daysUntilTarget(target) {
    const avg = averagePerDay();
    const current = totalEarned();
    if (current >= target) return 0;
    if (avg <= 0) return null; // unknown, no data yet
    return Math.ceil((target - current) / avg);
  }

  function projectedAfterDays(days) {
    return totalEarned() + averagePerDay() * days;
  }

  function currentStreak() {
    const days = new Set(state.entries.map(e => e.date));
    if (days.size === 0) return 0;
    let streak = 0;
    let cursor = todayISO();
    // if no entry today, streak may still count from yesterday backwards,
    // but per common convention we start checking from today.
    if (!days.has(cursor)) {
      // allow streak to still show up to yesterday if today just hasn't been logged
      cursor = addDaysISO(cursor, -1);
      if (!days.has(cursor)) return 0;
    }
    while (days.has(cursor)) {
      streak++;
      cursor = addDaysISO(cursor, -1);
    }
    return streak;
  }

  function bestEarningDay() {
    return highestDay();
  }

  function totalEntries() {
    return state.entries.length;
  }

  function weeklyAverage() {
    return averagePerDay() * 7;
  }

  function monthlyAverage() {
    return averagePerDay() * 30;
  }

  /* ---------------------------------------------------------
     5. CURRENCY / FORMATTING
     --------------------------------------------------------- */
  function formatTON(n) {
    if (n === null || n === undefined || isNaN(n)) return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  function formatCurrency(tonAmount) {
    const price = Number(state.settings.tonPriceUZS) || 0;
    const currency = state.settings.currency;
    // We only truly track UZS price; for other currencies we just label the same numeric conversion
    // (keeps things simple/offline — user sets the "price" field in whichever unit they prefer per currency)
    const value = tonAmount * price;
    const symbols = { UZS: 'сум', USD: '$', EUR: '€', RUB: '₽' };
    const sym = symbols[currency] || currency;
    if (currency === 'USD' || currency === 'EUR') {
      return `${sym}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${sym}`;
  }

  function groupById(id) {
    return state.groups.find(g => g.id === id);
  }

  /* ---------------------------------------------------------
     6. TOAST
     --------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------------------------------------------------
     7. CONFETTI
     --------------------------------------------------------- */
  const confettiCanvas = document.getElementById('confettiCanvas');
  const cctx = confettiCanvas.getContext('2d');
  let confettiParticles = [];
  let confettiRAF = null;

  function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfettiCanvas);
  resizeConfettiCanvas();

  function launchConfetti() {
    const colors = ['#3B9EFF', '#7A5CFF', '#33D17A', '#FFB340', '#FF5C7A', '#7AD0FF'];
    const count = 140;
    confettiParticles = [];
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * confettiCanvas.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        life: 0,
        maxLife: 160 + Math.random() * 60
      });
    }
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    animateConfetti();
  }

  function animateConfetti() {
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = false;
    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.rotation += p.vr;
      p.life++;
      if (p.life < p.maxLife && p.y < confettiCanvas.height + 30) alive = true;
      const opacity = Math.max(0, 1 - p.life / p.maxLife);
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate((p.rotation * Math.PI) / 180);
      cctx.globalAlpha = opacity;
      cctx.fillStyle = p.color;
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cctx.restore();
    });
    if (alive) {
      confettiRAF = requestAnimationFrame(animateConfetti);
    } else {
      cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  function checkMilestones(previousTotal, newTotal) {
    MILESTONES.forEach(m => {
      if (previousTotal < m && newTotal >= m && !state.meta.unlockedMilestones.includes(m)) {
        state.meta.unlockedMilestones.push(m);
        launchConfetti();
        showToast(`🎉 Milestone reached: ${m} TON!`);
      }
    });
  }

  /* ---------------------------------------------------------
     8. NAVIGATION
     --------------------------------------------------------- */
  const pages = ['dashboard', 'history', 'stats', 'forecast', 'settings'];

  function goToPage(name) {
    pages.forEach(p => {
      document.getElementById(`page-${p}`).classList.toggle('active', p === name);
    });
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === name);
    });
    document.getElementById('mainContent').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    // Render page-specific content lazily for performance
    if (name === 'dashboard') renderDashboard();
    if (name === 'history') renderHistory();
    if (name === 'stats') renderStats();
    if (name === 'forecast') renderForecast();
    if (name === 'settings') renderSettings();
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.page));
  });

  /* ---------------------------------------------------------
     9. THEME
     --------------------------------------------------------- */
  function applyTheme() {
    document.body.classList.toggle('light', !state.settings.darkMode);
    const darkSwitch = document.getElementById('darkModeSwitch');
    if (darkSwitch) darkSwitch.checked = state.settings.darkMode;
  }

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.settings.darkMode = !state.settings.darkMode;
    saveData();
    applyTheme();
    renderAllCharts(); // charts need color refresh
  });

  /* ---------------------------------------------------------
     10. DASHBOARD RENDERING
     --------------------------------------------------------- */
  function renderTopbarDate() {
    document.getElementById('topbarDate').textContent = formatDatePretty(todayISO());
  }

  function renderHeroRing() {
    const total = totalEarned();
    const fractional = total - Math.floor(total); // progress within current TON unit
    const circumference = 2 * Math.PI * 70; // r=70
    const progress = total <= 0 ? 0 : fractional === 0 && total > 0 ? 1 : fractional;
    const offset = circumference - progress * circumference;

    const ring = document.getElementById('heroRingFg');
    ring.style.strokeDasharray = `${circumference}`;
    // animate via rAF timeout so CSS transition kicks in
    requestAnimationFrame(() => { ring.style.strokeDashoffset = `${offset}`; });

    document.getElementById('heroRingValue').textContent = formatTON(earnedToday());

    const nextTonDays = daysUntilTarget(Math.ceil(total) === total ? total + 1 : Math.ceil(total));
    document.getElementById('heroNextTon').textContent =
      nextTonDays === null ? 'Add data' : nextTonDays === 0 ? 'Today!' : `${nextTonDays} day${nextTonDays === 1 ? '' : 's'}`;

    document.getElementById('heroStreak').textContent = `${currentStreak()} day${currentStreak() === 1 ? '' : 's'} 🔥`;
  }

  function statCardHTML(icon, label, value, sub) {
    return `
      <div class="stat-card">
        <div class="stat-icon">${icon}</div>
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
      </div>`;
  }

  function renderDashboardStatGrid() {
    const grid = document.getElementById('statGrid');
    const items = [
      statCardHTML('☀️', "Today", `${formatTON(earnedToday())} TON`, formatCurrency(earnedToday())),
      statCardHTML('💎', 'Total Earned', `${formatTON(totalEarned())} TON`, formatCurrency(totalEarned())),
      statCardHTML('📊', 'Avg / Day', `${formatTON(averagePerDay())} TON`, ''),
      statCardHTML('📅', 'Monthly Est.', `${formatTON(estimatedMonthly())} TON`, formatCurrency(estimatedMonthly())),
      statCardHTML('⏱️', 'Next 1 TON', daysUntilTarget(Math.ceil(totalEarned()) === totalEarned() ? totalEarned() + 1 : Math.ceil(totalEarned())) === null ? '—' : `${daysUntilTarget(Math.ceil(totalEarned()) === totalEarned() ? totalEarned() + 1 : Math.ceil(totalEarned()))}d`, 'days left'),
      statCardHTML('🚀', '90-Day Est.', `${formatTON(projectedAfterDays(90))} TON`, '')
    ];
    grid.innerHTML = items.join('');
  }

  function renderGroupGrid() {
    const grid = document.getElementById('groupGrid');
    if (state.groups.length === 0) {
      grid.innerHTML = `<p class="empty-state">No project groups yet. Create one to start tracking.</p>`;
      return;
    }
    grid.innerHTML = state.groups.map(g => {
      const earned = state.entries.filter(e => e.groupId === g.id).reduce((s, e) => s + e.amount, 0);
      const initial = g.name.trim().charAt(0).toUpperCase() || '?';
      return `
        <div class="group-card">
          <div class="group-color-dot" style="background:${g.color}">${initial}</div>
          <div class="group-info">
            <h4>${escapeHTML(g.name)}</h4>
            <p>${escapeHTML(g.description || 'No description')}</p>
            <div class="group-meta">
              <span>👥 ${g.accounts || 0} accounts</span>
              <span>💎 ${formatTON(earned)} TON</span>
            </div>
          </div>
          <div class="group-actions">
            <button data-edit-group="${g.id}" title="Edit">✎</button>
            <button data-delete-group="${g.id}" title="Delete">🗑</button>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-edit-group]').forEach(btn => {
      btn.addEventListener('click', () => openGroupModal(btn.dataset.editGroup));
    });
    grid.querySelectorAll('[data-delete-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction('Delete this group and detach it from any entries?', () => {
          state.groups = state.groups.filter(g => g.id !== btn.dataset.deleteGroup);
          saveData();
          renderAll();
          showToast('Group deleted');
        });
      });
    });
  }

  const BADGES = [
    { id: 'first_entry', icon: '🌱', label: 'First Entry', test: () => totalEntries() >= 1 },
    { id: 'streak_3', icon: '🔥', label: '3-Day Streak', test: () => currentStreak() >= 3 },
    { id: 'streak_7', icon: '⚡', label: '7-Day Streak', test: () => currentStreak() >= 7 },
    { id: 'one_ton', icon: '💎', label: '1 TON Earned', test: () => totalEarned() >= 1 },
    { id: 'ten_ton', icon: '👑', label: '10 TON Earned', test: () => totalEarned() >= 10 },
    { id: 'fifty_ton', icon: '🏆', label: '50 TON Earned', test: () => totalEarned() >= 50 },
    { id: 'hundred_ton', icon: '🌟', label: '100 TON Club', test: () => totalEarned() >= 100 },
    { id: 'multi_group', icon: '🗂️', label: '3+ Groups', test: () => state.groups.length >= 3 },
    { id: 'entries_30', icon: '📈', label: '30 Entries', test: () => totalEntries() >= 30 }
  ];

  function renderBadges() {
    const row = document.getElementById('badgeRow');
    row.innerHTML = BADGES.map(b => {
      const unlocked = b.test();
      return `
        <div class="badge ${unlocked ? 'unlocked' : ''}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-label">${b.label}</div>
        </div>`;
    }).join('');
  }

  function renderDashboard() {
    renderTopbarDate();
    renderHeroRing();
    renderDashboardStatGrid();
    renderGroupGrid();
    renderBadges();
    renderDashboardChart();
  }

  /* ---------------------------------------------------------
     11. HISTORY PAGE
     --------------------------------------------------------- */
  function populateProjectSelects() {
    const entrySelect = document.getElementById('entryProject');
    const filterSelect = document.getElementById('historyProjectFilter');
    const groupOptions = state.groups.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join('');

    entrySelect.innerHTML = state.groups.length
      ? groupOptions
      : `<option value="" disabled selected>Create a group first</option>`;

    filterSelect.innerHTML = `<option value="">All projects</option>` + groupOptions;
  }

  function getFilteredEntries() {
    const search = document.getElementById('historySearch').value.trim().toLowerCase();
    const projectFilter = document.getElementById('historyProjectFilter').value;
    const dateFilter = document.getElementById('historyDateFilter').value;
    const sort = document.getElementById('historySort').value;

    let list = state.entries.slice();

    if (search) {
      list = list.filter(e => {
        const g = groupById(e.groupId);
        const name = g ? g.name.toLowerCase() : '';
        const notes = (e.notes || '').toLowerCase();
        return name.includes(search) || notes.includes(search);
      });
    }
    if (projectFilter) list = list.filter(e => e.groupId === projectFilter);
    if (dateFilter) list = list.filter(e => e.date === dateFilter);

    switch (sort) {
      case 'oldest': list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)); break;
      case 'highest': list.sort((a, b) => b.amount - a.amount); break;
      case 'lowest': list.sort((a, b) => a.amount - b.amount); break;
      default: list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); // newest
    }
    return list;
  }

  function renderHistory() {
    populateProjectSelects();
    const list = getFilteredEntries();
    const container = document.getElementById('historyList');
    const emptyState = document.getElementById('historyEmpty');

    if (list.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    container.innerHTML = list.map(e => {
      const g = groupById(e.groupId);
      const color = g ? g.color : '#888';
      const name = g ? g.name : 'Unknown project';
      return `
        <div class="history-item" data-entry-id="${e.id}">
          <div class="history-dot" style="background:${color}"></div>
          <div class="history-info">
            <div class="hi-top">
              <span class="hi-project">${escapeHTML(name)}</span>
              <span class="hi-amount">${formatTON(e.amount)} TON</span>
            </div>
            <div class="hi-meta">
              <span>${formatDateShort(e.date)}</span>
              ${g ? `<span>👥 ${g.accounts || 0} accounts</span>` : ''}
            </div>
            ${e.notes ? `<div class="hi-notes">📝 ${escapeHTML(e.notes)}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => openEntryModal(item.dataset.entryId));
    });
  }

  ['historySearch', 'historyProjectFilter', 'historyDateFilter', 'historySort'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderHistory);
    document.getElementById(id).addEventListener('change', renderHistory);
  });
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('historySearch').value = '';
    document.getElementById('historyProjectFilter').value = '';
    document.getElementById('historyDateFilter').value = '';
    document.getElementById('historySort').value = 'newest';
    renderHistory();
  });

  /* ---------------------------------------------------------
     12. STATISTICS PAGE
     --------------------------------------------------------- */
  function renderStats() {
    const grid = document.getElementById('statsDetailGrid');
    const hi = highestDay();
    const lo = lowestDay();
    grid.innerHTML = [
      statCardHTML('💎', 'Total TON', formatTON(totalEarned())),
      statCardHTML('📊', 'Average TON/Day', formatTON(averagePerDay())),
      statCardHTML('🔝', 'Highest Day', hi.date ? `${formatTON(hi.amount)} TON` : '—', hi.date ? formatDateShort(hi.date) : ''),
      statCardHTML('🔻', 'Lowest Day', lo.date ? `${formatTON(lo.amount)} TON` : '—', lo.date ? formatDateShort(lo.date) : ''),
      statCardHTML('👤', 'Avg / Account', formatTON(averagePerAccount())),
      statCardHTML('🗂️', 'Avg / Group', formatTON(averagePerGroup())),
      statCardHTML('📆', 'Avg Weekly', formatTON(weeklyAverage())),
      statCardHTML('🗓️', 'Avg Monthly', formatTON(monthlyAverage())),
      statCardHTML('🧾', 'Total Entries', String(totalEntries()))
    ].join('');

    renderWeeklyChart();
    renderMonthlyChart();
    renderProjectCompareChart();
    renderProjectPieChart();
  }

  /* ---------------------------------------------------------
     13. FORECAST PAGE
     --------------------------------------------------------- */
  function forecastCardHTML(label, value, progressPct) {
    return `
      <div class="forecast-card">
        <div class="fc-label">${label}</div>
        <div class="fc-value">${value}</div>
        ${progressPct !== undefined ? `
        <div class="fc-progress"><div class="fc-progress-fill" style="width:${Math.min(100, progressPct)}%"></div></div>` : ''}
      </div>`;
  }

  function renderForecast() {
    const total = totalEarned();
    const targetGrid = document.getElementById('forecastTargetGrid');
    targetGrid.innerHTML = [1, 5, 10].map(t => {
      const d = daysUntilTarget(t);
      const pct = Math.min(100, (total / t) * 100);
      return forecastCardHTML(`Next ${t} TON`, d === null ? 'No data yet' : d === 0 ? 'Reached!' : `${d} days`, pct);
    }).join('');

    const projGrid = document.getElementById('forecastProjectionGrid');
    projGrid.innerHTML = [7, 30, 60, 90].map(days => {
      return forecastCardHTML(`After ${days} days`, `${formatTON(projectedAfterDays(days))} TON`);
    }).join('');

    // Countdown card — nearest upcoming milestone
    const nextMilestone = MILESTONES.find(m => total < m) || (Math.ceil(total / 50) + 1) * 50;
    const daysLeft = daysUntilTarget(nextMilestone);
    const countdownCard = document.getElementById('countdownCard');
    countdownCard.innerHTML = `
      <div class="cd-target">Next milestone: ${nextMilestone} TON</div>
      <div class="cd-days">${daysLeft === null ? '—' : daysLeft === 0 ? '🎉' : daysLeft}</div>
      <div class="cd-sub">${daysLeft === null ? 'Log entries to unlock forecasts' : daysLeft === 0 ? 'Milestone reached!' : 'days remaining at current pace'}</div>
    `;
  }

  /* ---------------------------------------------------------
     14. SETTINGS PAGE
     --------------------------------------------------------- */
  function renderSettings() {
    document.getElementById('tonPriceInput').value = state.settings.tonPriceUZS;
    document.getElementById('currencySelect').value = state.settings.currency;
    document.getElementById('darkModeSwitch').checked = state.settings.darkMode;
  }

  document.getElementById('saveCurrencyBtn').addEventListener('click', () => {
    const price = parseFloat(document.getElementById('tonPriceInput').value);
    state.settings.tonPriceUZS = isNaN(price) ? 0 : price;
    state.settings.currency = document.getElementById('currencySelect').value;
    saveData();
    showToast('Currency settings saved');
    renderAll();
  });

  document.getElementById('darkModeSwitch').addEventListener('change', (e) => {
    state.settings.darkMode = e.target.checked;
    saveData();
    applyTheme();
    renderAllCharts();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ton-tracker-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup exported');
  });

  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported.groups || !imported.entries) throw new Error('Invalid file format');
        state = {
          groups: imported.groups || [],
          entries: imported.entries || [],
          settings: Object.assign({}, DEFAULT_DATA.settings, imported.settings || {}),
          meta: Object.assign({}, DEFAULT_DATA.meta, imported.meta || {})
        };
        saveData();
        applyTheme();
        renderAll();
        showToast('Backup imported successfully');
      } catch (err) {
        showToast('Import failed: invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    confirmAction('This will permanently delete all groups, entries and settings. Continue?', () => {
      state = structuredClone(DEFAULT_DATA);
      saveData();
      applyTheme();
      renderAll();
      showToast('All data has been reset');
    });
  });

  /* ---------------------------------------------------------
     15. ENTRY MODAL (Add / Edit)
     --------------------------------------------------------- */
  const entryModalOverlay = document.getElementById('entryModalOverlay');

  function openEntryModal(entryId) {
    if (state.groups.length === 0) {
      showToast('Create a project group first');
      return;
    }
    populateProjectSelects();
    const isEdit = !!entryId;
    document.getElementById('entryModalTitle').textContent = isEdit ? 'Edit Earning' : 'Add Earning';
    document.getElementById('deleteEntryBtn').style.display = isEdit ? 'block' : 'none';

    if (isEdit) {
      const entry = state.entries.find(e => e.id === entryId);
      document.getElementById('entryId').value = entry.id;
      document.getElementById('entryDate').value = entry.date;
      document.getElementById('entryProject').value = entry.groupId;
      document.getElementById('entryAmount').value = entry.amount;
      document.getElementById('entryNotes').value = entry.notes || '';
    } else {
      document.getElementById('entryId').value = '';
      document.getElementById('entryDate').value = todayISO();
      document.getElementById('entryAmount').value = '';
      document.getElementById('entryNotes').value = '';
    }
    entryModalOverlay.classList.add('open');
  }

  function closeEntryModal() {
    entryModalOverlay.classList.remove('open');
  }

  document.getElementById('fabAddEntry').addEventListener('click', () => openEntryModal(null));
  document.getElementById('closeEntryModal').addEventListener('click', closeEntryModal);
  entryModalOverlay.addEventListener('click', (e) => { if (e.target === entryModalOverlay) closeEntryModal(); });

  document.getElementById('saveEntryBtn').addEventListener('click', () => {
    const id = document.getElementById('entryId').value;
    const date = document.getElementById('entryDate').value;
    const groupId = document.getElementById('entryProject').value;
    const amount = parseFloat(document.getElementById('entryAmount').value);
    const notes = document.getElementById('entryNotes').value.trim();

    if (!date) { showToast('Please choose a date'); return; }
    if (!groupId) { showToast('Please choose a project'); return; }
    if (isNaN(amount) || amount < 0) { showToast('Please enter a valid TON amount'); return; }

    const previousTotal = totalEarned();

    if (id) {
      const entry = state.entries.find(e => e.id === id);
      entry.date = date; entry.groupId = groupId; entry.amount = amount; entry.notes = notes;
      showToast('Entry updated');
    } else {
      state.entries.push({ id: uid(), date, groupId, amount, notes });
      showToast('Entry saved');
    }
    saveData();
    checkMilestones(previousTotal, totalEarned());
    closeEntryModal();
    renderAll();
  });

  document.getElementById('deleteEntryBtn').addEventListener('click', () => {
    const id = document.getElementById('entryId').value;
    confirmAction('Delete this entry?', () => {
      state.entries = state.entries.filter(e => e.id !== id);
      saveData();
      closeEntryModal();
      renderAll();
      showToast('Entry deleted');
    });
  });

  /* ---------------------------------------------------------
     16. GROUP MODAL (Add / Edit)
     --------------------------------------------------------- */
  const groupModalOverlay = document.getElementById('groupModalOverlay');
  let selectedGroupColor = GROUP_COLORS[0];

  function renderColorSwatches() {
    const wrap = document.getElementById('colorSwatches');
    wrap.innerHTML = GROUP_COLORS.map(c => `
      <div class="color-swatch ${c === selectedGroupColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>
    `).join('');
    wrap.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        selectedGroupColor = sw.dataset.color;
        renderColorSwatches();
      });
    });
  }

  function openGroupModal(groupId) {
    const isEdit = !!groupId;
    document.getElementById('groupModalTitle').textContent = isEdit ? 'Edit Project Group' : 'New Project Group';
    document.getElementById('deleteGroupBtn').style.display = isEdit ? 'block' : 'none';

    if (isEdit) {
      const g = groupById(groupId);
      document.getElementById('groupId').value = g.id;
      document.getElementById('groupName').value = g.name;
      document.getElementById('groupAccounts').value = g.accounts;
      document.getElementById('groupDescription').value = g.description || '';
      selectedGroupColor = g.color;
    } else {
      document.getElementById('groupId').value = '';
      document.getElementById('groupName').value = '';
      document.getElementById('groupAccounts').value = '';
      document.getElementById('groupDescription').value = '';
      selectedGroupColor = GROUP_COLORS[state.groups.length % GROUP_COLORS.length];
    }
    renderColorSwatches();
    groupModalOverlay.classList.add('open');
  }

  function closeGroupModal() {
    groupModalOverlay.classList.remove('open');
  }

  document.getElementById('addGroupBtn').addEventListener('click', () => openGroupModal(null));
  document.getElementById('closeGroupModal').addEventListener('click', closeGroupModal);
  groupModalOverlay.addEventListener('click', (e) => { if (e.target === groupModalOverlay) closeGroupModal(); });

  document.getElementById('saveGroupBtn').addEventListener('click', () => {
    const id = document.getElementById('groupId').value;
    const name = document.getElementById('groupName').value.trim();
    const accounts = parseInt(document.getElementById('groupAccounts').value, 10) || 0;
    const description = document.getElementById('groupDescription').value.trim();

    if (!name) { showToast('Please enter a group name'); return; }

    if (id) {
      const g = groupById(id);
      g.name = name; g.accounts = accounts; g.description = description; g.color = selectedGroupColor;
      showToast('Group updated');
    } else {
      state.groups.push({ id: uid(), name, accounts, description, color: selectedGroupColor });
      showToast('Group created');
    }
    saveData();
    closeGroupModal();
    renderAll();
  });

  document.getElementById('deleteGroupBtn').addEventListener('click', () => {
    const id = document.getElementById('groupId').value;
    confirmAction('Delete this group? Its entries will remain but show as "Unknown project".', () => {
      state.groups = state.groups.filter(g => g.id !== id);
      saveData();
      closeGroupModal();
      renderAll();
      showToast('Group deleted');
    });
  });

  /* ---------------------------------------------------------
     17. CONFIRM MODAL
     --------------------------------------------------------- */
  const confirmOverlay = document.getElementById('confirmOverlay');

  function confirmAction(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    pendingDeleteAction = onConfirm;
    confirmOverlay.classList.add('open');
  }

  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    confirmOverlay.classList.remove('open');
    pendingDeleteAction = null;
  });
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    if (pendingDeleteAction) pendingDeleteAction();
    pendingDeleteAction = null;
    confirmOverlay.classList.remove('open');
  });
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) {
      confirmOverlay.classList.remove('open');
      pendingDeleteAction = null;
    }
  });

  /* ---------------------------------------------------------
     18. UTIL
     --------------------------------------------------------- */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     19. CHARTS - lightweight hand-rolled canvas renderer
     (No external chart library so the app works fully offline
     with zero dependencies. Handles device-pixel-ratio scaling,
     simple entrance animation, and light/dark aware colors.)
     --------------------------------------------------------- */
  function chartTextColor() {
    return state.settings.darkMode ? '#8a97b5' : '#5a6785';
  }
  function chartGridColor() {
    return state.settings.darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  }

  function prepCanvas(canvas, cssHeight) {
    const parentWidth = canvas.parentElement.clientWidth - 8;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = parentWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.max(1, Math.round(parentWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: parentWidth, h: cssHeight };
  }

  function destroyChart(key) {
    if (charts[key] && charts[key].cancelAnim) charts[key].cancelAnim();
    delete charts[key];
  }

  function animateChart(key, draw, duration) {
    duration = duration || 700;
    const start = performance.now();
    let raf;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      draw(eased);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    charts[key] = { cancelAnim: function () { cancelAnimationFrame(raf); } };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + rad * Math.sign(h || 1));
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad * Math.sign(h || 1), rad);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function drawLineChart(canvas, labels, values, color, fillColor) {
    destroyChart(canvas.id);
    const prep = prepCanvas(canvas, 180);
    const ctx = prep.ctx, w = prep.w, h = prep.h;
    const padL = 6, padR = 6, padT = 14, padB = 22;
    const max = Math.max(0.0001, Math.max.apply(null, values)) * 1.15;
    const stepX = (w - padL - padR) / Math.max(1, values.length - 1);

    function xAt(i) { return padL + i * stepX; }
    function yAt(v) { return padT + (1 - v / max) * (h - padT - padB); }

    animateChart(canvas.id, function (progress) {
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = chartGridColor();
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const gy = padT + (i / 3) * (h - padT - padB);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
      }

      if (values.length > 0) {
        const revealCount = values.length * progress;

        ctx.beginPath();
        values.forEach(function (v, i) {
          if (i > revealCount) return;
          const x = xAt(i), y = yAt(v);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        const lastIdx = Math.min(values.length - 1, Math.floor(revealCount));
        if (lastIdx >= 0) {
          ctx.lineTo(xAt(lastIdx), h - padB);
          ctx.lineTo(xAt(0), h - padB);
          ctx.closePath();
          ctx.fillStyle = fillColor;
          ctx.fill();
        }

        values.forEach(function (v, i) {
          if (i > revealCount) return;
          const x = xAt(i), y = yAt(v);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }

      ctx.fillStyle = chartTextColor();
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const skip = labels.length > 10 ? Math.ceil(labels.length / 7) : 1;
      labels.forEach(function (lab, i) {
        if (i % skip !== 0 && i !== labels.length - 1) return;
        ctx.fillText(lab, xAt(i), h - 6);
      });
    });
  }

  function drawBarChart(canvas, labels, values, colors, horizontal) {
    destroyChart(canvas.id);
    const prep = prepCanvas(canvas, horizontal ? Math.max(160, labels.length * 34) : 180);
    const ctx = prep.ctx, w = prep.w, h = prep.h;
    const padL = horizontal ? 90 : 10, padR = 10, padT = 10, padB = horizontal ? 10 : 24;
    const max = Math.max(0.0001, Math.max.apply(null, values)) * 1.15;

    animateChart(canvas.id, function (progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = chartTextColor();
      ctx.font = '10.5px -apple-system, sans-serif';

      if (horizontal) {
        const gap = (h - padT - padB) / values.length;
        const barH = gap * 0.62;
        values.forEach(function (v, i) {
          const y = padT + i * gap + (gap - barH) / 2;
          const fullW = (v / max) * (w - padL - padR);
          const barW = fullW * progress;
          ctx.fillStyle = Array.isArray(colors) ? colors[i] : colors;
          roundRect(ctx, padL, y, Math.max(2, barW), barH, 6);
          ctx.fill();
          ctx.fillStyle = chartTextColor();
          ctx.textAlign = 'right';
          const label = labels[i].length > 12 ? labels[i].slice(0, 11) + '\u2026' : labels[i];
          ctx.fillText(label, padL - 8, y + barH / 2 + 3);
        });
      } else {
        const gap = (w - padL - padR) / values.length;
        const barW = gap * 0.5;
        ctx.strokeStyle = chartGridColor();
        for (let i = 0; i <= 3; i++) {
          const gy = padT + (i / 3) * (h - padT - padB);
          ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
        }
        values.forEach(function (v, i) {
          const x = padL + i * gap + (gap - barW) / 2;
          const fullH = (v / max) * (h - padT - padB);
          const barH = fullH * progress;
          const y = h - padB - barH;
          ctx.fillStyle = Array.isArray(colors) ? colors[i] : colors;
          roundRect(ctx, x, y, barW, barH, 5);
          ctx.fill();
        });
        ctx.fillStyle = chartTextColor();
        ctx.textAlign = 'center';
        const skip = labels.length > 8 ? 2 : 1;
        labels.forEach(function (lab, i) {
          if (i % skip !== 0 && i !== labels.length - 1) return;
          const x = padL + i * gap + gap / 2;
          ctx.fillText(lab, x, h - 6);
        });
      }
    });
  }

  function drawDoughnutChart(canvas, labels, values, colors, legendEl) {
    destroyChart(canvas.id);
    const prep = prepCanvas(canvas, 220);
    const ctx = prep.ctx, w = prep.w, h = prep.h;
    const cx = w / 2, cy = h / 2 - 6;
    const radius = Math.min(w, h - 20) / 2 - 8;
    const total = values.reduce(function (s, v) { return s + v; }, 0);

    if (legendEl) {
      if (total === 0) {
        legendEl.innerHTML = '<p class="empty-state" style="padding:12px;">No earnings yet to compare.</p>';
      } else {
        legendEl.innerHTML = labels.map(function (lab, i) {
          return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-1);margin:4px 10px 0 0;">' +
            '<span style="width:9px;height:9px;border-radius:50%;background:' + colors[i] + ';display:inline-block;"></span>' +
            escapeHTML(lab) + ' (' + (total > 0 ? ((values[i] / total) * 100).toFixed(0) : 0) + '%)</span>';
        }).join('');
      }
    }

    animateChart(canvas.id, function (progress) {
      ctx.clearRect(0, 0, w, h);
      if (total <= 0) {
        ctx.fillStyle = chartTextColor();
        ctx.textAlign = 'center';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.fillText('No data yet', cx, cy);
        return;
      }
      let startAngle = -Math.PI / 2;
      const sweepTotal = Math.PI * 2 * progress;
      values.forEach(function (v, i) {
        const slice = (v / total) * sweepTotal;
        if (slice <= 0) return;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        startAngle += slice;
      });
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = state.settings.darkMode ? '#141d33' : '#eef3fc';
      ctx.fill();
    });
  }

  function lastNDaysLabelsAndTotals(n) {
    const labels = [];
    const totals = [];
    for (let i = n - 1; i >= 0; i--) {
      const iso = addDaysISO(todayISO(), -i);
      labels.push(formatDateShort(iso));
      const sum = state.entries.filter(function (e) { return e.date === iso; }).reduce(function (s, e) { return s + e.amount; }, 0);
      totals.push(Number(sum.toFixed(4)));
    }
    return { labels: labels, totals: totals };
  }

  function renderDashboardChart() {
    const r = lastNDaysLabelsAndTotals(14);
    const canvas = document.getElementById('dashboardDailyChart');
    drawLineChart(canvas, r.labels, r.totals, '#3B9EFF', 'rgba(59,158,255,0.16)');
  }

  function renderWeeklyChart() {
    const labels = [];
    const totals = [];
    for (let i = 7; i >= 0; i--) {
      const end = addDaysISO(todayISO(), -i * 7);
      const start = addDaysISO(end, -6);
      const sum = state.entries.filter(function (e) { return e.date >= start && e.date <= end; }).reduce(function (s, e) { return s + e.amount; }, 0);
      labels.push(formatDateShort(start));
      totals.push(Number(sum.toFixed(4)));
    }
    drawBarChart(document.getElementById('weeklyChart'), labels, totals, '#3B9EFF');
  }

  function renderMonthlyChart() {
    const labels = [];
    const totals = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const y = d.getFullYear(); const m = d.getMonth();
      const sum = state.entries.filter(function (e) {
        const ed = new Date(e.date + 'T00:00:00');
        return ed.getFullYear() === y && ed.getMonth() === m;
      }).reduce(function (s, e) { return s + e.amount; }, 0);
      labels.push(monthLabel);
      totals.push(Number(sum.toFixed(4)));
    }
    drawBarChart(document.getElementById('monthlyChart'), labels, totals, '#7A5CFF');
  }

  function renderProjectCompareChart() {
    const labels = state.groups.map(function (g) { return g.name; });
    const totals = state.groups.map(function (g) {
      return Number(state.entries.filter(function (e) { return e.groupId === g.id; }).reduce(function (s, e) { return s + e.amount; }, 0).toFixed(4));
    });
    const colors = state.groups.map(function (g) { return g.color; });
    const canvas = document.getElementById('projectCompareChart');
    if (labels.length === 0) {
      destroyChart(canvas.id);
      const prep = prepCanvas(canvas, 120);
      prep.ctx.clearRect(0, 0, prep.w, prep.h);
      prep.ctx.fillStyle = chartTextColor();
      prep.ctx.textAlign = 'center';
      prep.ctx.font = '13px -apple-system, sans-serif';
      prep.ctx.fillText('Create project groups to compare', prep.w / 2, prep.h / 2);
      return;
    }
    drawBarChart(canvas, labels, totals, colors, labels.length > 4);
  }

  function renderProjectPieChart() {
    const labels = state.groups.map(function (g) { return g.name; });
    const totals = state.groups.map(function (g) {
      return Number(state.entries.filter(function (e) { return e.groupId === g.id; }).reduce(function (s, e) { return s + e.amount; }, 0).toFixed(4));
    });
    const colors = state.groups.map(function (g) { return g.color; });
    const canvas = document.getElementById('projectPieChart');
    let legendEl = document.getElementById('projectPieLegend');
    if (!legendEl) {
      legendEl = document.createElement('div');
      legendEl.id = 'projectPieLegend';
      legendEl.style.textAlign = 'center';
      legendEl.style.marginTop = '4px';
      canvas.parentElement.appendChild(legendEl);
    }
    drawDoughnutChart(canvas, labels, totals, colors, legendEl);
  }

  function renderAllCharts() {
    const active = pages.find(function (p) { return document.getElementById('page-' + p).classList.contains('active'); });
    if (active === 'dashboard') renderDashboardChart();
    if (active === 'stats') { renderWeeklyChart(); renderMonthlyChart(); renderProjectCompareChart(); renderProjectPieChart(); }
  }

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAllCharts, 150);
  });

  /* ---------------------------------------------------------
     20. MASTER RENDER
     --------------------------------------------------------- */
  function renderAll() {
    renderDashboard();
    // Only re-render other pages if they're currently visible, to save cycles
    const active = pages.find(p => document.getElementById(`page-${p}`).classList.contains('active'));
    if (active === 'history') renderHistory();
    if (active === 'stats') renderStats();
    if (active === 'forecast') renderForecast();
    if (active === 'settings') renderSettings();
  }

  /* ---------------------------------------------------------
     21. INIT
     --------------------------------------------------------- */
  function init() {
    applyTheme();
    goToPage('dashboard');
  }

  // All charts are drawn with native <canvas> — no external library needed,
  // so the whole app works completely offline straight from index.html.
  document.addEventListener('DOMContentLoaded', init);
})();
 
