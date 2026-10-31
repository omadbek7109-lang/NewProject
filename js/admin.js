/* FLECT STARS — admin panel.
 * Brauzer hech kimni admin qilmaydi: har bir so'rov serverda initData imzosi va admin
 * Telegram ID bilan tekshiriladi. Bu fayl faqat interfeys.
 */
(function () {
"use strict";
var API = window.FlectAPI;
var TGW = window.Telegram && window.Telegram.WebApp;
var TG = TGW && TGW.platform && TGW.platform !== "unknown" ? TGW : null;
var root = document.getElementById("adm");
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function price(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function money(n) { return price(n) + " so'm"; }
function short(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (Math.round(n / 1e4) / 100).toString().replace(".", ",") + " mln";
  if (n >= 1e3) return Math.round(n / 1e3) + " ming";
  return String(n);
}
function p2(n) { return (n < 10 ? "0" : "") + n; }
function fmtDate(s) { var d = new Date(s); return isNaN(d) ? "" : p2(d.getDate()) + "." + p2(d.getMonth() + 1) + "." + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
function haptic(k) { try { if (TG && TG.HapticFeedback) { k === "ok" ? TG.HapticFeedback.notificationOccurred("success") : k === "err" ? TG.HapticFeedback.notificationOccurred("error") : TG.HapticFeedback.impactOccurred("light"); } } catch (e) {} }
function ico(id, g) { return '<span class="ico ' + g + '"><svg style="color:#fff"><use href="#' + id + '"/></svg></span>'; }

var STATUS = { new: "Yangi", paid: "To'lov tasdiqlangan", processing: "Bajarilmoqda", completed: "Bajarildi", cancelled: "Bekor qilindi" };
var CATS = { stars: "Telegram Stars", premium: "Telegram Premium", accounts: "Akkauntlar", gifts: "Gifts", nft: "NFT / Kolleksiyalar" };
var MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

var tt;
function toast(m, ms) { var el = $("#toast"); el.textContent = m; el.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("show"); }, ms || 2600); }
function fail(e) { haptic("err"); toast((e && e.message) || "Xatolik yuz berdi", 3500); }

/* ---------- Holat ---------- */
var S = {
  tab: "stats",
  stats: null, statsErr: null, statsAt: null, unit: "day", sel: -1,
  orders: [], total: 0, oStatus: "", oSearch: "", oLoading: false, oErr: null,
  products: null, pErr: null, showArchived: false
};

/* ---------- Qobiq ---------- */
function header() {
  return '<header class="hdr"><a class="round" href="index.html" aria-label="Ilovaga qaytish"><svg><use href="#u-back"/></svg></a>' +
    '<div class="brand">' + ico("u-shield", "g-brand") + '<div><b>FLECT</b><small>Admin panel</small></div></div>' +
    '<button class="round" data-act="refresh" aria-label="Yangilash"><svg><use href="#u-refresh"/></svg></button></header>';
}
function gate(title, text) {
  root.innerHTML = '<div class="view enter">' + header() + '<div class="empty glass gate">' + ico("u-shield", "g-brand") + '<b>' + esc(title) + '</b><p>' + esc(text) + '</p></div></div>';
}
function shell() {
  root.innerHTML = '<div class="view enter">' + header() +
    '<nav class="seg glass" role="tablist" aria-label="Bo\'limlar">' +
    [["stats", "Statistika"], ["orders", "Buyurtmalar"], ["products", "Mahsulotlar"]].map(function (t) {
      return '<button role="tab" data-tab="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>';
    }).join("") + '</nav><div id="pane" class="view"></div></div>';
  paint();
}
function paint() {
  $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tab") === S.tab); });
  var pane = $("#pane"); if (!pane) return;
  pane.innerHTML = S.tab === "stats" ? statsView() : S.tab === "orders" ? ordersView() : productsView();
}
function skel(n, h) { var s = ""; for (var i = 0; i < n; i++) s += '<div class="skel glass" style="height:' + (h || 80) + 'px"></div>'; return '<div class="list">' + s + '</div>'; }
function errBox(e, act) { return '<div class="empty glass"><b>Yuklab bo\'lmadi</b><p>' + esc(e.message) + '</p><button class="buy blue" data-act="' + act + '">Qayta urinish</button></div>'; }

/* =====================================================================
   STATISTIKA
   ===================================================================== */
function loadStats() {
  S.statsErr = null;
  return API.admin("stats").then(function (d) { S.stats = d; S.statsAt = new Date(); S.sel = -1; }, function (e) { S.statsErr = e; })
    .then(function () { if (S.tab === "stats") paint(); });
}
function kpi(v, label, cls) { return '<div class="kpi glass ' + (cls || "") + '"><b>' + price(v) + '</b><small>' + label + '</small></div>'; }
function statsView() {
  if (S.statsErr) return errBox(S.statsErr, "stats");
  if (!S.stats) return skel(1, 120) + skel(2, 70);
  var s = S.stats.summary;
  var series = S.unit === "day" ? S.stats.daily : S.stats.monthly;
  return '<section class="rev glass"><small>Tasdiqlangan tushum</small><b>' + money(s.revenue_confirmed) + '</b>' +
    '<p>Faqat bajarilgan va to\'lovi tasdiqlangan buyurtmalar.</p></section>' +
    '<div class="grp">Foydalanuvchilar</div><div class="kpis">' +
      kpi(s.users_total, "Jami") + kpi(s.users_new_today, "Bugun yangi") + kpi(s.users_new_7d, "7 kunda yangi") +
      kpi(s.users_new_30d, "30 kunda yangi") + kpi(s.users_active_7d, "Faol (7 kun)") + kpi(s.users_active_30d, "Faol (30 kun)") + '</div>' +
    '<div class="grp">Buyurtmalar</div><div class="kpis">' +
      kpi(s.orders_total, "Jami") + kpi(s.orders_new, "Yangi", "warn") + kpi(s.orders_paid, "To'langan") + kpi(s.orders_processing, "Bajarilmoqda") +
      kpi(s.orders_completed, "Bajarildi", "good") + kpi(s.orders_cancelled, "Bekor qilindi", "bad") + '</div>' +
    '<section class="chart glass"><div class="chart-h"><b>Savdo (tushum)</b><div class="mini-seg">' +
      '<button data-unit="day" aria-pressed="' + (S.unit === "day") + '">30 kun</button><button data-unit="month" aria-pressed="' + (S.unit === "month") + '">12 oy</button></div></div>' +
      chartSvg(series) + '<div class="chart-cap" id="cap">' + capText(series, S.sel) + '</div></section>' +
    '<div class="grp">Eng ko\'p sotilganlar</div>' + topList(S.stats.top) +
    '<p class="note">Yangilangan: ' + (S.statsAt ? p2(S.statsAt.getHours()) + ":" + p2(S.statsAt.getMinutes()) : "") + ' · vaqt zonasi ' + esc(s.timezone) + '</p>';
}
function niceMax(v) {
  if (v <= 0) return 100000;
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  var steps = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
  return 10 * p;
}
function periodLabel(d, unit) {
  var x = new Date(d + "T00:00:00");
  return unit === "day" ? p2(x.getDate()) + "." + p2(x.getMonth() + 1) : MONTHS[x.getMonth()];
}
function chartSvg(series) {
  var W = 360, H = 190, pl = 46, pr = 6, pt = 10, pb = 24;
  var vals = series.map(function (r) { return Number(r.revenue) || 0; });
  var max = niceMax(Math.max.apply(null, vals.concat([0])));
  var iw = W - pl - pr, ih = H - pt - pb, n = series.length, bw = iw / n, gap = Math.min(4, bw * 0.25);
  var y = function (v) { return pt + ih - (v / max) * ih; };
  var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Savdo grafigi"><defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="var(--a2)"/><stop offset="1" stop-color="var(--a1)"/></linearGradient></defs><g class="grid">';
  [0, 0.5, 1].forEach(function (f) {
    var v = max * f, yy = y(v).toFixed(1);
    out += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/><text class="ax" x="' + (pl - 6) + '" y="' + (Number(yy) + 3) + '" text-anchor="end">' + short(v) + '</text>';
  });
  out += '</g>';
  var every = S.unit === "day" ? 5 : 2;
  series.forEach(function (r, i) {
    var v = vals[i], x = pl + i * bw + gap / 2, w = Math.max(1, bw - gap), top = v > 0 ? y(v) : pt + ih - 2, h = v > 0 ? pt + ih - top : 2;
    out += '<rect class="bar' + (v > 0 ? "" : " zero") + (i === S.sel ? " sel" : "") + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(3, w / 2).toFixed(1) + '"/>';
    out += '<rect class="hit" data-bar="' + i + '" x="' + (pl + i * bw).toFixed(1) + '" y="' + pt + '" width="' + bw.toFixed(1) + '" height="' + ih + '"/>';
    if ((n - 1 - i) % every === 0) out += '<text class="ax" x="' + (pl + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + periodLabel(r.period, S.unit) + '</text>';
  });
  return out + '</svg>';
}
function capText(series, i) {
  if (i < 0 || !series[i]) {
    var t = series.reduce(function (a, r) { return a + (Number(r.revenue) || 0); }, 0), c = series.reduce(function (a, r) { return a + (Number(r.orders) || 0); }, 0);
    return (S.unit === "day" ? "30 kunda: " : "12 oyda: ") + '<b>' + money(t) + '</b> · ' + c + ' ta buyurtma. Ustunni bosing.';
  }
  var r = series[i];
  return periodLabel(r.period, S.unit) + (S.unit === "day" ? "" : " " + String(r.period).slice(0, 4)) + ': <b>' + money(r.revenue) + '</b> · ' + r.orders + ' ta buyurtma';
}
function topList(top) {
  if (!top || !top.length) return '<div class="empty glass"><b>Hali sotuv yo\'q</b><p>Bajarilgan va to\'lovi tasdiqlangan buyurtmalar shu yerda ko\'rinadi.</p></div>';
  return '<div class="toplist glass">' + top.map(function (t, i) {
    return '<div><i>' + (i + 1) + '</i><span>' + esc(t.title) + '</span><em><b>' + t.quantity + ' ta</b>' + short(t.revenue) + ' so\'m</em></div>';
  }).join("") + '</div>';
}

/* =====================================================================
   BUYURTMALAR
   ===================================================================== */
function loadOrders(append) {
  if (S.oLoading) return;
  S.oLoading = true; S.oErr = null;
  if (!append) { S.orders = []; S.total = 0; }
  if (S.tab === "orders") paintOrders();
  API.admin("orders_list", { status: S.oStatus || null, search: S.oSearch || null, limit: 30, offset: append ? S.orders.length : 0 })
    .then(function (d) { S.orders = append ? S.orders.concat(d.items) : d.items; S.total = d.total; }, function (e) { S.oErr = e; })
    .then(function () { S.oLoading = false; if (S.tab === "orders") paintOrders(); });
}
function ordersView() {
  var f = [["", "Barchasi"], ["new", "Yangi"], ["paid", "To'langan"], ["processing", "Bajarilmoqda"], ["completed", "Bajarildi"], ["cancelled", "Bekor"]];
  return '<label class="search glass"><svg><use href="#u-search"/></svg><input id="oq" type="search" placeholder="Kod, ism, @username yoki ID" value="' + esc(S.oSearch) + '" autocomplete="off" aria-label="Buyurtma qidirish"></label>' +
    '<div class="chips" role="group" aria-label="Holat">' + f.map(function (c) { return '<button class="chip" data-ost="' + c[0] + '" aria-pressed="' + (S.oStatus === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>' +
    '<div id="olist">' + ordersList() + '</div>';
}
function paintOrders() { var el = $("#olist"); if (el) el.innerHTML = ordersList(); }
function ordersList() {
  if (S.oErr && !S.orders.length) return errBox(S.oErr, "orders");
  if (S.oLoading && !S.orders.length) return skel(4, 110);
  if (!S.orders.length) return '<div class="empty glass"><b>Buyurtma topilmadi</b><p>' + (S.oSearch || S.oStatus ? "Filtrni o'zgartirib ko'ring." : "Hali buyurtma yo'q.") + '</p></div>';
  return '<p class="note">Topildi: ' + S.total + ' ta</p><div class="list">' + S.orders.map(function (o, i) {
    var who = [o.first_name, o.last_name].filter(Boolean).join(" ") + (o.username ? " · @" + o.username : "");
    return '<button class="ord glass tap" data-ord="' + i + '"><div class="ord-top"><span class="code">' + esc(o.code) + '</span><span class="st st-' + o.status + '">' + STATUS[o.status] + '</span></div>' +
      '<b class="ord-title">' + esc(o.quantity > 1 ? o.quantity + " × " + o.product_title : o.product_title) + '</b>' +
      '<span class="who">' + esc(who) + '</span>' +
      '<div class="ord-meta"><span>' + money(o.total_price) + '</span><span>' + fmtDate(o.created_at) + '</span></div>' +
      (o.status !== "cancelled" ? (o.payment_confirmed ? '<small class="pay ok">To\'lov tasdiqlangan</small>' : '<small class="pay">To\'lov tasdiqlanmagan</small>') : '') + '</button>';
  }).join("") + '</div>' + (S.orders.length < S.total ? '<button class="buy blue more" data-act="more"' + (S.oLoading ? " disabled" : "") + '>Yana yuklash</button>' : "");
}

/* ---------- Pastdan chiqadigan oyna ---------- */
var sheetEl = null;
function openSheet(html) {
  closeSheet(true);
  sheetEl = document.createElement("div");
  sheetEl.className = "scrim"; sheetEl.setAttribute("role", "dialog"); sheetEl.setAttribute("aria-modal", "true");
  sheetEl.innerHTML = '<div class="sheet">' + html + '</div>';
  sheetEl.addEventListener("click", function (e) { if (e.target === sheetEl || e.target.closest("[data-close]")) closeSheet(); });
  document.body.appendChild(sheetEl);
  requestAnimationFrame(function () { sheetEl && sheetEl.classList.add("show"); });
  if (TG && TG.BackButton) TG.BackButton.show();
}
function closeSheet(now) {
  if (!sheetEl) return;
  var el = sheetEl; sheetEl = null;
  if (now) el.remove(); else { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 300); }
  if (TG && TG.BackButton) TG.BackButton.hide();
}
function sheet() { return sheetEl && $(".sheet", sheetEl); }

var cur = null; // ochiq buyurtma
function openOrder(o) {
  cur = o;
  openSheet(orderSheet(o, null));
  API.admin("order_history", { order_id: o.id }).then(function (h) {
    if (cur && cur.id === o.id && sheet()) { var t = $("#hist", sheet()); if (t) t.innerHTML = historyHtml(h); }
  }, function () { var t = sheet() && $("#hist", sheet()); if (t) t.innerHTML = '<small class="pay">Tarixni yuklab bo\'lmadi</small>'; });
}
function historyHtml(h) {
  if (!h || !h.length) return "";
  return h.map(function (r) {
    var who = r.actor === "admin" ? "Admin " + r.actor_id : r.actor === "customer" ? "Mijoz" : "Tizim";
    var what = r.from_status === r.to_status ? (r.note || "Yangilandi") : (r.from_status ? STATUS[r.from_status] + " → " : "") + STATUS[r.to_status];
    return '<div><b>' + esc(what) + '</b>' + (r.note && r.from_status !== r.to_status ? ' — ' + esc(r.note) : '') + '<small>' + fmtDate(r.created_at) + ' · ' + esc(who) + '</small></div>';
  }).join("");
}
function orderSheet(o) {
  var name = [o.first_name, o.last_name].filter(Boolean).join(" ") || "Nomsiz";
  // Holatlar: new -> paid (to'lov) -> processing -> completed; bekor qilish yakuniy bo'lmagan har qanday holatdan.
  // "Bajarildi" faqat to'lov tasdiqlangandan keyin (server ham shuni tekshiradi).
  var open = o.status === "new" || o.status === "paid" || o.status === "processing";
  var acts = "";
  var full = o.status === "processing" ? " full" : ""; // bitta tugma qolsa, butun qatorni egallaydi
  if (o.status === "new" || o.status === "paid") acts += '<button class="buy blue" data-do="processing">Jarayonga olish</button>';
  if (open && o.payment_confirmed) acts += '<button class="buy green' + full + '" data-do="completed" data-confirm="Tasdiqlash: Bajarildi">Bajarildi</button>';
  if (open && !o.payment_confirmed) acts += '<button class="buy ghosty' + full + '" data-do="pay" data-confirm="Tasdiqlash: to\'lov keldi">To\'lovni tasdiqlash</button>';
  if (open) acts += '<button class="buy red full" data-do="cancel-open">Bekor qilish</button>';
  return '<div class="sh-h"><div class="tx"><b>' + esc(o.code) + '</b><small>' + fmtDate(o.created_at) + '</small></div><span class="st st-' + o.status + '">' + STATUS[o.status] + '</span><button class="x" data-close aria-label="Yopish"><svg><use href="#u-x"/></svg></button></div>' +
    '<dl class="kv"><dt>Mahsulot</dt><dd>' + esc(o.quantity > 1 ? o.quantity + " × " + o.product_title : o.product_title) + '</dd>' +
    '<dt>Summa</dt><dd>' + money(o.total_price) + '</dd>' +
    '<dt>To\'lov</dt><dd>' + (o.payment_confirmed ? "Tasdiqlangan" + (o.payment_confirmed_at ? " · " + fmtDate(o.payment_confirmed_at) : "") : "Tasdiqlanmagan") + '</dd>' +
    '<dt>Mijoz</dt><dd>' + esc(name) + '</dd>' +
    (o.username ? '<dt>Telegram</dt><dd><a href="https://t.me/' + esc(o.username) + '" data-tg target="_blank" rel="noopener">@' + esc(o.username) + '</a></dd>' : '') +
    '<dt>ID</dt><dd>' + esc(o.user_id) + '</dd>' +
    (o.cancel_reason ? '<dt>Sabab</dt><dd>' + esc(o.cancel_reason) + '</dd>' : '') + '</dl>' +
    (acts ? '<div class="acts">' + acts + '</div>' +
      '<div id="cancelBox" hidden><div class="field"><label for="reason">Bekor qilish sababi</label><textarea id="reason" maxlength="500" placeholder="Masalan: to\'lov kelmadi"></textarea></div>' +
      '<div class="acts" style="margin-top:8px"><button class="buy ghosty" data-do="cancel-close">Ortga</button><button class="buy red" data-do="cancelled">Bekor qilish</button></div></div>' +
      '<label class="check"><input type="checkbox" id="notify" checked> Mijozga bot orqali xabar yuborish</label>' : '') +
    '<div class="grp">Tarix</div><div class="timeline" id="hist"><small class="pay">Yuklanmoqda…</small></div>';
}
var armed = null;
function orderAction(btn) {
  var what = btn.getAttribute("data-do");
  if (what === "cancel-open") { $("#cancelBox", sheet()).hidden = false; $("#reason", sheet()).focus(); return; }
  if (what === "cancel-close") { $("#cancelBox", sheet()).hidden = true; return; }
  // Qaytarib bo'lmaydigan amallar: ikkinchi bosishda bajariladi
  if (btn.hasAttribute("data-confirm") && armed !== btn) {
    if (armed) { armed.classList.remove("armed"); armed.textContent = armed.getAttribute("data-label"); }
    btn.setAttribute("data-label", btn.textContent); btn.textContent = btn.getAttribute("data-confirm"); btn.classList.add("armed"); armed = btn; haptic(); return;
  }
  armed = null;
  var o = cur, notify = $("#notify", sheet()) ? $("#notify", sheet()).checked : true;
  var p;
  if (what === "pay") p = API.admin("confirm_payment", { order_id: o.id }).then(function (row) { return { order: row, notification: null }; });
  else {
    var note = what === "cancelled" ? $("#reason", sheet()).value.trim() : null;
    if (what === "cancelled" && note.length < 3) { toast("Sababni yozing (kamida 3 belgi)"); return; }
    p = API.admin("order_status", { order_id: o.id, status: what, note: note, notify_customer: notify });
  }
  $$("button", sheet()).forEach(function (b) { b.disabled = true; });
  btn.classList.add("loading");
  p.then(function (r) {
    haptic("ok");
    var merged = Object.assign({}, o, r.order);
    var idx = S.orders.findIndex(function (x) { return x.id === o.id; });
    if (idx > -1) S.orders[idx] = merged;
    paintOrders();
    S.stats = null;
    var n = r.notification;
    toast(what === "pay" ? "To'lov tasdiqlandi" : STATUS[what] + (n === "sent" ? " · mijozga xabar yuborildi" : n === "blocked" ? " · mijoz botni bloklagan yoki /start bosmagan" : n === "failed" ? " · xabar yuborilmadi" : ""), 3500);
    openOrder(merged);
  }, function (e) { fail(e); $$("button", sheet()).forEach(function (b) { b.disabled = false; }); btn.classList.remove("loading"); });
}

/* =====================================================================
   MAHSULOTLAR
   ===================================================================== */
function loadProducts() {
  S.pErr = null;
  return API.admin("products_list", { include_archived: S.showArchived }).then(function (d) { S.products = d; }, function (e) { S.pErr = e; })
    .then(function () { if (S.tab === "products") paint(); });
}
function productsView() {
  var head = '<div class="toolbar"><button class="buy blue" data-act="new">+ Yangi mahsulot</button><label class="check"><input type="checkbox" id="arch"' + (S.showArchived ? " checked" : "") + '> Arxivni ko\'rsatish</label></div>';
  if (S.pErr) return head + errBox(S.pErr, "products");
  if (!S.products) return head + skel(5, 64);
  var out = head;
  Object.keys(CATS).forEach(function (c) {
    var list = S.products.filter(function (p) { return p.category === c; });
    if (!list.length) return;
    out += '<div class="grp">' + CATS[c] + '</div><div class="list">' + list.map(function (p) {
      var tags = p.archived_at ? '<span class="tag">Arxivda</span>' : (p.is_active ? '<span class="tag on">Sotuvda</span>' : '<span class="tag off">Sotuvda yo\'q</span>') + (p.is_popular ? '<span class="tag pop">Ommabop</span>' : '');
      return '<div class="prow glass"><div class="tx"><b>' + esc(p.title) + '</b><small>' + esc(p.message_name) + ' · ' + esc(p.slug) + '</small><div class="tags">' + tags + '</div></div>' +
        '<span class="p">' + price(p.price_uzs) + (p.price_is_from ? "+" : "") + '</span>' +
        (p.archived_at ? '' : '<button class="icon-btn" data-edit="' + esc(p.id) + '" aria-label="Tahrirlash"><svg><use href="#u-chev"/></svg></button>') + '</div>';
    }).join("") + '</div>';
  });
  return out;
}
function field(id, label, value, attrs, hint) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(value == null ? "" : value) + '" ' + (attrs || "") + '>' + (hint ? '<small>' + hint + '</small>' : '') + '</div>';
}
function productSheet(p) {
  var isNew = !p; p = p || { category: "stars", is_active: true, tags: [], sort_order: 0 };
  return '<div class="sh-h"><div class="tx"><b>' + (isNew ? "Yangi mahsulot" : esc(p.title)) + '</b><small>' + (isNew ? "Barcha maydonlarni to'ldiring" : esc(p.slug)) + '</small></div><button class="x" data-close aria-label="Yopish"><svg><use href="#u-x"/></svg></button></div>' +
    '<form id="pform" novalidate>' +
    '<div class="row2"><div class="field"><label for="f_cat">Toifa</label><select id="f_cat">' + Object.keys(CATS).map(function (c) { return '<option value="' + c + '"' + (p.category === c ? " selected" : "") + '>' + CATS[c] + '</option>'; }).join("") + '</select></div>' +
    field("f_slug", "Slug", p.slug, 'required maxlength="63" pattern="[a-z0-9][a-z0-9-]{1,62}" autocapitalize="off"', "kichik harf, raqam, chiziqcha") + '</div>' +
    field("f_title", "Nomi (kartochkada)", p.title, 'required maxlength="120"') +
    field("f_msg", "Xabardagi nomi", p.message_name, 'maxlength="120"', "\"menga ___ kerak!\" — bo'sh qolsa nomi olinadi") +
    field("f_sub", "Tavsif", p.subtitle, 'maxlength="200"', "Gifts uchun: \"50 Stars\" — kartochkada va filtrda ishlatiladi") +
    '<div class="row2">' + field("f_price", "Narx (so'm)", p.price_uzs, 'required inputmode="numeric" pattern="[0-9]*"') + field("f_sort", "Tartib", p.sort_order, 'inputmode="numeric"') + '</div>' +
    field("f_img", "Rasm", p.image, 'maxlength="512"', "emoji, img/gifts/nomi.webp yoki https:// havola") +
    field("f_tags", "Teglar", (p.tags || []).join(", "), 'maxlength="80"', "ixtiyoriy") +
    '<label class="check"><input type="checkbox" id="f_active"' + (p.is_active ? " checked" : "") + '> Sotuvda</label>' +
    '<label class="check"><input type="checkbox" id="f_pop"' + (p.is_popular ? " checked" : "") + '> Ommabop</label>' +
    '<label class="check"><input type="checkbox" id="f_from"' + (p.price_is_from ? " checked" : "") + '> Narx "…dan" (minimal narx)</label>' +
    '<p class="form-err" id="ferr"></p>' +
    '<div class="acts"><button type="button" class="buy ghosty" data-close>Bekor</button><button type="submit" class="buy blue">Saqlash</button>' +
    (isNew ? '' : '<button type="button" class="buy red full" data-do="archive" data-confirm="Tasdiqlash: o\'chirish">Mahsulotni o\'chirish</button>') + '</div></form>' +
    (isNew ? '' : '<p class="note">O\'chirilgan mahsulot arxivlanadi, eski buyurtmalar tarixi saqlanadi.</p>');
}
var editing = null;
function openProduct(p) { editing = p; openSheet(productSheet(p)); }
function v(id) { return $("#" + id, sheet()).value.trim(); }
function saveProduct(btn) {
  var err = $("#ferr", sheet()); err.textContent = "";
  var priceV = v("f_price").replace(/\s/g, "");
  if (!/^\d+$/.test(priceV) || Number(priceV) < 1) { err.textContent = "Narx musbat butun son bo'lishi kerak."; return; }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(v("f_slug"))) { err.textContent = "Slug: kichik lotin harfi, raqam va chiziqcha (2–63 belgi)."; return; }
  if (!v("f_title")) { err.textContent = "Nomini kiriting."; return; }
  var sort = v("f_sort") === "" ? 0 : Number(v("f_sort"));
  if (!Number.isInteger(sort)) { err.textContent = "Tartib butun son bo'lishi kerak."; return; }
  var data = {
    category: $("#f_cat", sheet()).value, slug: v("f_slug"), title: v("f_title"), message_name: v("f_msg") || v("f_title"),
    subtitle: v("f_sub") || null, price_uzs: Number(priceV), sort_order: sort, image: v("f_img") || null,
    tags: v("f_tags") ? v("f_tags").split(",").map(function (t) { return t.trim(); }).filter(Boolean) : [],
    is_active: $("#f_active", sheet()).checked, is_popular: $("#f_pop", sheet()).checked, price_is_from: $("#f_from", sheet()).checked
  };
  btn.disabled = true; btn.classList.add("loading");
  API.admin("product_save", { id: editing ? editing.id : null, data: data }).then(function () {
    haptic("ok"); toast(editing ? "Saqlandi" : "Mahsulot qo'shildi"); closeSheet(); loadProducts();
  }, function (e) { haptic("err"); err.textContent = e.message; btn.disabled = false; btn.classList.remove("loading"); });
}
function archiveProduct(btn) {
  if (armed !== btn) { if (armed) armed.classList.remove("armed"); btn.setAttribute("data-label", btn.textContent); btn.textContent = btn.getAttribute("data-confirm"); btn.classList.add("armed"); armed = btn; return; }
  armed = null; btn.disabled = true; btn.classList.add("loading");
  API.admin("product_archive", { id: editing.id }).then(function () { haptic("ok"); toast("Mahsulot arxivlandi"); closeSheet(); loadProducts(); },
    function (e) { fail(e); btn.disabled = false; btn.classList.remove("loading"); });
}

/* =====================================================================
   Hodisalar
   ===================================================================== */
var searchT;
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-tab],[data-act],[data-unit],[data-bar],[data-ost],[data-ord],[data-edit],[data-do],[data-tg]");
  if (!t) return;
  if (t.hasAttribute("data-tg") && TG && TG.openTelegramLink) { e.preventDefault(); TG.openTelegramLink(t.href); return; }
  if (t.hasAttribute("data-tab")) { S.tab = t.getAttribute("data-tab"); haptic(); paint(); ensure(); return; }
  if (t.hasAttribute("data-unit")) { S.unit = t.getAttribute("data-unit"); S.sel = -1; paint(); return; }
  if (t.hasAttribute("data-bar")) { var i = Number(t.getAttribute("data-bar")); S.sel = S.sel === i ? -1 : i; haptic(); paint(); return; }
  if (t.hasAttribute("data-ost")) { S.oStatus = t.getAttribute("data-ost"); $$("[data-ost]").forEach(function (c) { c.setAttribute("aria-pressed", c === t); }); loadOrders(false); return; }
  if (t.hasAttribute("data-ord")) { openOrder(S.orders[Number(t.getAttribute("data-ord"))]); return; }
  if (t.hasAttribute("data-edit")) { var id = t.getAttribute("data-edit"); openProduct(S.products.filter(function (p) { return p.id === id; })[0]); return; }
  if (t.hasAttribute("data-do")) { if (t.getAttribute("data-do") === "archive") archiveProduct(t); else orderAction(t); return; }
  var a = t.getAttribute("data-act");
  if (a === "refresh") { haptic(); refresh(); }
  else if (a === "stats") { S.statsErr = null; paint(); loadStats(); }
  else if (a === "orders") loadOrders(false);
  else if (a === "more") loadOrders(true);
  else if (a === "products") { S.pErr = null; paint(); loadProducts(); }
  else if (a === "new") openProduct(null);
});
document.addEventListener("input", function (e) {
  if (e.target.id === "oq") { clearTimeout(searchT); searchT = setTimeout(function () { S.oSearch = e.target.value.trim(); loadOrders(false); }, 350); }
});
document.addEventListener("change", function (e) {
  if (e.target.id === "arch") { S.showArchived = e.target.checked; S.products = null; paint(); loadProducts(); }
});
document.addEventListener("submit", function (e) {
  if (e.target.id === "pform") { e.preventDefault(); saveProduct($("button[type=submit]", e.target)); }
});

function ensure() {
  if (S.tab === "stats" && !S.stats && !S.statsErr) loadStats();
  if (S.tab === "orders" && !S.orders.length && !S.oLoading && !S.oErr) loadOrders(false);
  if (S.tab === "products" && !S.products && !S.pErr) loadProducts();
}
function refresh() {
  if (S.tab === "stats") { S.stats = null; paint(); loadStats(); }
  else if (S.tab === "orders") loadOrders(false);
  else { S.products = null; paint(); loadProducts(); }
}

/* ---------- Boshlash ---------- */
// Telegram: full ekran (Bot API 8.0+, faqat telefonda), pastga surib yopilmasin, ranglar
function tgSetup(TG){
  try{
    TG.ready(); TG.expand();
    var v=function(x){return TG.isVersionAtLeast&&TG.isVersionAtLeast(x)};
    if(v("7.7")&&TG.disableVerticalSwipes)TG.disableVerticalSwipes();
    if(v("8.0")&&TG.requestFullscreen&&!TG.isFullscreen&&/^(android|ios)$/.test(TG.platform))TG.requestFullscreen();
    if(TG.setHeaderColor)TG.setHeaderColor("#030a1c");
    if(TG.setBackgroundColor)TG.setBackgroundColor("#030a1c");
    if(v("7.10")&&TG.setBottomBarColor)TG.setBottomBarColor("#030a1c");
  }catch(e){}
}

try { var acc = localStorage.getItem("flect-accent"); if (acc && acc !== "ocean") document.documentElement.setAttribute("data-accent", acc); } catch (e) {}
if (TG) {
  tgSetup(TG);
  try {
    TG.BackButton && TG.BackButton.onClick(function () { if (sheetEl) closeSheet(); else location.href = "index.html"; }); } catch (e) {}
}
if (!API.configured()) gate("Sozlanmagan", "js/config.js faylida Supabase manzili va ochiq kalitini kiriting.");
else if (!API.inTelegram()) gate("Telegram ichida oching", "Admin panel faqat Telegram Mini App ichida ishlaydi: ilovada Profil → Admin panel.");
else {
  gate("Tekshirilmoqda…", "Admin huquqi serverda tekshirilyapti.");
  API.admin("whoami").then(function () { shell(); ensure(); }, function (e) {
    if (e.code === "not_admin") gate("Ruxsat yo'q", "Bu Telegram akkauntida admin huquqi yo'q.");
    else gate("Kirib bo'lmadi", e.message || "Xatolik yuz berdi.");
  });
}
})();
 
