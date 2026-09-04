/* =========================================================
   FLECT — App shell (routing + rendering + purchase flow)
   ========================================================= */

// ---- Telegram WebApp safe init -----------------------------------
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("#F7F6FB");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#F7F6FB");
  } catch (e) { /* non-Telegram browser: ignore */ }
}

// ---- Helpers --------------------------------------------------------
function formatSom(n) {
  return n.toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
}

function openAdmin(text) {
  const url = `https://t.me/${CONFIG.adminUsername}?text=${encodeURIComponent(text)}`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
  showToast("Admin bilan chat ochilmoqda…");
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.2c.3-1 1.2-1.7 2.5-1.7 1.4 0 2.5.9 2.5 2.1 0 1.9-2.5 1.8-2.5 3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1" fill="currentColor"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 11.5L12 4l8 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9h12v-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  services: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/><rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/></svg>`,
  orders: `<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h9l3 3v13H6V4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 10h6M9 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.4" stroke="currentColor" stroke-width="2"/><path d="M5 19.5c1.4-3.4 4-5 7-5s5.6 1.6 7 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 1 1-4-7.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4l-8.2 8.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
};

// ---- Router -----------------------------------------------------------
const NAV_ROUTES = ["home", "services", "orders", "help", "profile"];

function currentRoute() {
  const hash = location.hash.replace("#/", "") || "home";
  return hash;
}

function navigate(route) {
  location.hash = `/${route}`;
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

function render() {
  const route = currentRoute();
  const app = document.getElementById("view");
  const topbar = document.getElementById("topbar-slot");
  app.scrollTop = 0;
  window.scrollTo(0, 0);

  let html = "";
  let title = null;
  let showBack = !NAV_ROUTES.includes(route);

  if (route === "home") html = renderHome();
  else if (route === "services") { html = renderServices(); title = "Xizmatlar"; showBack = false; }
  else if (route === "stars") { html = renderStars(); title = "Telegram Stars"; }
  else if (route === "premium") { html = renderPremium(); title = "Telegram Premium"; }
  else if (route === "accounts") { html = renderAccounts(); title = "Telegram Akkauntlar"; }
  else if (route === "gifts") { html = renderGifts(); title = "Telegram Gifts"; }
  else if (route === "orders") { html = renderEmpty("orders"); title = "Buyurtmalar"; showBack = false; }
  else if (route === "help") { html = renderHelp(); title = "Yordam"; showBack = false; }
  else if (route === "profile") { html = renderEmpty("profile"); title = "Profil"; showBack = false; }
  else { html = renderHome(); }

  topbar.innerHTML = renderTopbar(title, showBack);
  app.innerHTML = `<div class="page">${html}</div>`;
  renderBottomNav(route);
  bindDynamicHandlers();
}

function renderTopbar(title, showBack) {
  if (title) {
    return `
      <div class="topbar-left">
        ${showBack ? `<button class="back-btn" onclick="history.back()" aria-label="Orqaga">${ICONS.back}</button>` : ""}
        <span class="topbar-title">${title}</span>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" onclick="navigate('help')" aria-label="Yordam">${ICONS.help}</button>
      </div>`;
  }
  return `
    <div class="topbar-left">
      <div class="brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M7 4h11l-2 3H9v4h6l-2 3H9v6H5V4h2z" fill="white"/></svg></span>
        <span class="brand-name">${CONFIG.brand}</span>
      </div>
    </div>
    <div class="topbar-right">
      <button class="icon-btn" onclick="navigate('help')" aria-label="Yordam">${ICONS.help}</button>
      <button class="icon-btn" onclick="navigate('profile')" aria-label="Profil">${ICONS.profile}</button>
    </div>`;
}

function renderBottomNav(route) {
  const items = [
    { id: "home", label: "Bosh sahifa", icon: ICONS.home },
    { id: "services", label: "Xizmatlar", icon: ICONS.services },
    { id: "orders", label: "Buyurtmalar", icon: ICONS.orders },
    { id: "help", label: "Yordam", icon: ICONS.help },
    { id: "profile", label: "Profil", icon: ICONS.profile }
  ];
  const activeSet = new Set(["home", "services", "orders", "help", "profile"]);
  const activeRoute = ["stars", "premium", "accounts", "gifts"].includes(route) ? "services" : route;
  document.getElementById("bottomnav").innerHTML = items.map(it => `
    <button class="nav-item ${activeRoute === it.id ? "active" : ""}" onclick="navigate('${it.id}')">
      ${it.icon}
      <span>${it.label}</span>
    </button>
  `).join("");
}

// ---- Home ----------------------------------------------------------------
function renderHome() {
  return `
    <div class="hero">
      <div class="hero-eyebrow">✦ ${CONFIG.brand}</div>
      <h1>Telegram xizmatlari — barchasi bir joyda</h1>
      <p>Stars, Premium, Gifts va boshqa xizmatlarni qulay narxda xarid qiling.</p>
      <button class="btn btn-primary" onclick="navigate('services')">Xizmatlarni ko‘rish</button>
    </div>

    <div class="trust-strip">
      ${trustPoints.map(t => `<div class="trust-pill">${ICONS.check}${t}</div>`).join("")}
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">Xizmatlar</h2>
        <button class="section-link" onclick="navigate('services')">Barchasi</button>
      </div>
      <div class="service-list">
        ${SERVICES.filter(s => !s.comingSoon).slice(0, 4).map(serviceCardHTML).join("")}
      </div>
    </div>

    ${adminCardHTML()}
    <div style="height:8px"></div>
  `;
}

function renderServices() {
  return `
    <div class="section" style="padding-top:16px">
      <div class="service-list">
        ${SERVICES.map(serviceCardHTML).join("")}
      </div>
    </div>
    ${adminCardHTML()}
    <div style="height:8px"></div>
  `;
}

function serviceCardHTML(s) {
  if (s.comingSoon) {
    return `
      <div class="service-card" style="opacity:0.6; cursor:default;">
        <div class="service-icon ${s.iconClass}">${s.icon}</div>
        <div class="service-body">
          <div class="service-name">${s.name}</div>
          <div class="service-desc">${s.desc}</div>
        </div>
      </div>`;
  }
  return `
    <button class="service-card" onclick="navigate('${s.route}')">
      <div class="service-icon ${s.iconClass}">${s.icon}</div>
      <div class="service-body">
        <div class="service-name">${s.name} ${s.badge ? `<span class="service-badge">${s.badge}</span>` : ""}</div>
        <div class="service-desc">${s.desc} →</div>
      </div>
      <div class="service-chevron">${ICONS.chevron}</div>
    </button>`;
}

function adminCardHTML() {
  return `
    <div class="admin-card">
      <div class="admin-avatar">${ICONS.admin}</div>
      <div class="admin-text">
        <div class="admin-title">Admin bilan bog‘lanish</div>
        <div class="admin-sub">@${CONFIG.adminUsername} — savollaringizga javob beramiz</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openAdmin('Assalomu alaykum!')">Yozish</button>
    </div>`;
}

// ---- Stars -----------------------------------------------------------
function renderStars() {
  return `
    <div class="svc-hero">
      <div class="svc-hero-icon" style="background:var(--stars-tint)">⭐</div>
      <div>
        <h2>Telegram Stars</h2>
        <p>Kerakli miqdorni tanlang va admin orqali xarid qiling.</p>
      </div>
    </div>
    <div class="section">
      <div class="product-list">
        ${starsProducts.map(p => `
          <div class="product-row">
            <div class="product-glyph" style="background:var(--stars-tint)">⭐</div>
            <div class="product-info">
              <div class="product-title">${p.amount.toLocaleString("ru-RU").replace(/,/g," ")} Stars</div>
            </div>
            <div class="product-price">${formatSom(p.price)}</div>
            <button class="buy-btn" onclick='buyStars(${JSON.stringify(p)})'>Sotib olish</button>
          </div>
        `).join("")}
      </div>
    </div>
    ${crossSellHTML("stars")}
  `;
}

function buyStars(p) {
  openAdmin(MESSAGES.stars(p));
}

// ---- Premium ---------------------------------------------------------
function renderPremium() {
  return `
    <div class="svc-hero">
      <div class="svc-hero-icon" style="background:var(--premium-tint)">💎</div>
      <div>
        <h2>Telegram Premium</h2>
        <p>Obuna muddatini tanlang. 12 oylik uchun ikki xil usul mavjud.</p>
      </div>
    </div>
    <div class="section">
      <div class="plan-list">
        ${premiumProducts.map(p => `
          <div class="plan-card">
            <div class="plan-top">
              <div class="plan-name">${p.label}</div>
              <div class="plan-price">${formatSom(p.price)}</div>
            </div>
            <div class="plan-note">${p.note}</div>
            <div class="plan-foot">
              ${p.tag ? `<span class="plan-tag" style="margin-right:auto">${p.tag}</span>` : ""}
              <button class="btn btn-accent btn-sm" style="background:var(--premium)" onclick='buyPremium(${JSON.stringify(p)})'>Sotib olish</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
    ${crossSellHTML("premium")}
  `;
}

function buyPremium(p) {
  openAdmin(MESSAGES.premium(p));
}

// ---- Accounts ---------------------------------------------------------
function renderAccounts() {
  const a = accountsInfo;
  return `
    <div class="svc-hero">
      <div class="svc-hero-icon" style="background:var(--accounts-tint)">👤</div>
      <div>
        <h2>${a.title}</h2>
        <p>${a.subtitle}</p>
      </div>
    </div>
    <div class="section">
      <span class="price-tag">${formatSom(a.startingPrice)}dan</span>
    </div>
    <div class="section">
      <div class="section-head"><h3 class="section-title" style="font-size:14.5px">Xarid tartibi</h3></div>
      <div class="account-flow">
        ${a.steps.map((s, i) => `
          <div class="flow-step">
            <div class="flow-num">${i + 1}</div>
            <div class="flow-text">${s}</div>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="section">
      <button class="btn btn-block" style="background:var(--accounts); color:#fff" onclick="buyAccount()">Admin bilan bog‘lanish</button>
      <p class="footnote" style="padding-left:0; padding-right:0;">Faqat qonuniy ravishda egalik qilingan va sotishga ruxsat etilgan akkauntlar taqdim etiladi.</p>
    </div>
    ${crossSellHTML("accounts")}
  `;
}

function buyAccount() {
  openAdmin(MESSAGES.accounts());
}

// ---- Gifts -------------------------------------------------------------
const GIFT_TINTS = ["gifts-tint", "premium-tint", "stars-tint", "accounts-tint", "green-tint", "blue-tint"];

function renderGifts() {
  return `
    <div class="svc-hero">
      <div class="svc-hero-icon" style="background:var(--gifts-tint)">🎁</div>
      <div>
        <h2>Telegram Gifts</h2>
        <p>Kolleksiya uchun tanlangan sovg‘alar.</p>
      </div>
    </div>
    <div class="section">
      <div class="gift-grid">
        ${gifts.map((g, i) => `
          <div class="gift-card">
            <div class="gift-art" style="background:var(--${GIFT_TINTS[i % GIFT_TINTS.length]})">${g.icon}</div>
            <div class="gift-name">${g.name}</div>
            <div class="gift-meta">
              <span class="gift-stars">⭐ ${g.stars}</span>
              <span class="gift-price">${formatSom(g.price)}</span>
            </div>
            <button class="gift-buy" onclick='buyGift(${JSON.stringify(g)})'>Sotib olish</button>
            <button class="gift-anon-btn" onclick='buyGiftAnon(${JSON.stringify(g)})'>Do‘stga anonim yuborish</button>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="section">
      <div class="info-note">
        <div class="info-note-icon">🎭</div>
        <div class="info-note-text">
          <strong>Anonim sovg‘a yuborish.</strong> Tanishingiz yoki do‘stingizga sovg‘ani anonim tarzda yuborishingiz mumkin — buning uchun tegishli sovg‘a ostidagi “Do‘stga anonim yuborish” tugmasini bosing. Admin bilan chatda faqat qabul qiluvchining ismi/akkaunti va xohlasangiz tabrik matnini yozib qoldirasiz, sovg‘a sizning nomingizdan ko‘rsatilmaydi.
        </div>
      </div>
    </div>
    ${crossSellHTML("gifts")}
  `;
}

function buyGift(g) {
  openAdmin(MESSAGES.gift(g));
}

function buyGiftAnon(g) {
  openAdmin(MESSAGES.giftAnon(g));
}

// ---- Cross-sell strip ----------------------------------------------------
function crossSellHTML(excludeId) {
  const others = SERVICES.filter(s => s.id !== excludeId && !s.comingSoon);
  return `
    <div class="section">
      <div class="section-head"><h3 class="section-title" style="font-size:14.5px">Sizga qiziq bo‘lishi mumkin</h3></div>
      <div class="crosssell">
        ${others.map(s => `
          <div class="cross-card" onclick="navigate('${s.route}')">
            <div class="cross-icon" style="background:var(--${s.iconClass}-tint)">${s.icon}</div>
            <div class="cross-name">${s.name}</div>
            <div class="cross-desc">${s.desc}</div>
          </div>
        `).join("")}
      </div>
    </div>
    <div style="height:6px"></div>
  `;
}

// ---- Help / empty pages ----------------------------------------------
function renderHelp() {
  return `
    <div class="section" style="padding-top:16px">
      <h2 class="section-title" style="margin-bottom:10px">Yordam kerakmi?</h2>
      <p style="font-size:13px; color:var(--ink-soft); line-height:1.6; margin-bottom:16px">
        Buyurtma, to‘lov yoki xizmatlar bo‘yicha savollaringiz bo‘lsa, admin bilan bevosita bog‘laning — tez orada javob beramiz.
      </p>
    </div>
    ${adminCardHTML()}
    <div class="section">
      <div class="section-head"><h3 class="section-title" style="font-size:14.5px">Tez-tez so‘raladigan savollar</h3></div>
      <div class="product-list">
        <div class="product-row" style="align-items:flex-start">
          <div class="product-info">
            <div class="product-title" style="font-size:13.5px">To‘lovdan keyin nima bo‘ladi?</div>
            <div class="product-sub">Admin buyurtmangizni tasdiqlaydi va tez orada yetkazib beradi.</div>
          </div>
        </div>
        <div class="product-row" style="align-items:flex-start">
          <div class="product-info">
            <div class="product-title" style="font-size:13.5px">Qanday to‘lov usullari mavjud?</div>
            <div class="product-sub">To‘lov tafsilotlari admin bilan suhbatda beriladi.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEmpty(kind) {
  const copy = {
    orders: { title: "Hozircha buyurtmalar yo‘q", desc: "Xarid qilganingizdan so‘ng buyurtmalaringiz shu yerda ko‘rinadi." },
    profile: { title: "Profil", desc: "Profil va buyurtmalar tarixi tez orada shu yerda bo‘ladi." }
  }[kind];
  return `
    <div class="empty-state">
      <div class="empty-icon">${ICONS.orders}</div>
      <div class="empty-title">${copy.title}</div>
      <div class="empty-desc">${copy.desc}</div>
    </div>
  `;
}

// ---- Dynamic handler binding (none needed beyond inline onclick,
//      kept for future extensibility) -------------------------------
function bindDynamicHandlers() {}
