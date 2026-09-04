/* =========================================================
   FLECT — Data layer
   All catalog data lives here. UI code (app.js) only renders it.
   To add a new gift/product later: push a new object into the
   matching array. To add a whole new service (e.g. NFT), add an
   entry to SERVICES and a matching products array + page renderer.
   ========================================================= */

// ---- Global config -----------------------------------------------
const CONFIG = {
  adminUsername: "Flect_number", // change this to your real admin @username (no @ sign)
  brand: "Flect"
};

// ---- Services shown on Home / Xizmatlar ---------------------------
const SERVICES = [
  {
    id: "stars",
    name: "Telegram Stars",
    desc: "Yulduzlar sotib oling",
    icon: "⭐",
    iconClass: "stars",
    route: "stars"
  },
  {
    id: "premium",
    name: "Telegram Premium",
    desc: "Premium obunangizni faollashtiring",
    icon: "💎",
    iconClass: "premium",
    route: "premium"
  },
  {
    id: "accounts",
    name: "Telegram Akkauntlar",
    desc: "O‘zbekiston raqamli akkauntlar",
    icon: "👤",
    iconClass: "accounts",
    route: "accounts"
  },
  {
    id: "gifts",
    name: "Telegram Gifts",
    desc: "Kolleksiya uchun sovg‘alar",
    icon: "🎁",
    iconClass: "gifts",
    route: "gifts",
    badge: "Yangi"
  },
  {
    id: "nft",
    name: "NFT / Kolleksiyalar",
    desc: "Tez orada",
    icon: "🖼",
    iconClass: "accounts",
    route: null,
    comingSoon: true
  }
];

// ---- Telegram Stars packages ---------------------------------------
const starsProducts = [
  { id: "s50", amount: 50, price: 12000 },
  { id: "s75", amount: 75, price: 17000 },
  { id: "s100", amount: 100, price: 23000 },
  { id: "s150", amount: 150, price: 34000 },
  { id: "s200", amount: 200, price: 45000 },
  { id: "s300", amount: 300, price: 66000 },
  { id: "s500", amount: 500, price: 108000 },
  { id: "s1000", amount: 1000, price: 210000 },
  { id: "s2500", amount: 2500, price: 510000 },
  { id: "s5000", amount: 5000, price: 990000 },
  { id: "s10000", amount: 10000, price: 1900000 }
];

// ---- Telegram Premium plans -----------------------------------------
const premiumProducts = [
  {
    id: "p1",
    label: "1 oy",
    price: 45000,
    note: "1 oylik Telegram Premium obunasi.",
    method: "1 oylik"
  },
  {
    id: "p3",
    label: "3 oy",
    price: 179000,
    note: "3 oylik Telegram Premium obunasi.",
    method: "3 oylik"
  },
  {
    id: "p6",
    label: "6 oy",
    price: 239000,
    note: "6 oylik Telegram Premium obunasi.",
    method: "6 oylik"
  },
  {
    id: "p12-account",
    label: "12 oy — Akkaunt orqali",
    price: 299000,
    note: "Faollashtirish akkaunt usuli orqali amalga oshiriladi.",
    method: "12 oylik, akkaunt orqali",
    tag: "Akkaunt orqali"
  },
  {
    id: "p12-gift",
    label: "12 oy — Gift sifatida",
    price: 399000,
    note: "Premium sovg‘a (gift) sifatida yetkaziladi.",
    method: "12 oylik, gift sifatida",
    tag: "Gift"
  }
];

// ---- Telegram Gifts ---------------------------------------------------
// Real Telegram gift collection, grouped by star tier.
// To add a new gift later: copy a line and change id / name / icon / tier.
const gifts = [
  { id: "g-heart", name: "Yurak", stars: 15, price: 4000, icon: "💝" },
  { id: "g-bear", name: "Ayiqcha", stars: 15, price: 4000, icon: "🧸" },
  { id: "g-box", name: "Sovg‘a qutisi", stars: 25, price: 6000, icon: "🎁" },
  { id: "g-rose", name: "Atirgul", stars: 25, price: 6000, icon: "🌹" },
  { id: "g-cake", name: "Tort", stars: 50, price: 11000, icon: "🎂" },
  { id: "g-bouquet", name: "Gulchambar", stars: 50, price: 11000, icon: "💐" },
  { id: "g-rocket", name: "Raketa", stars: 50, price: 11000, icon: "🚀" },
  { id: "g-champagne", name: "Shampan", stars: 50, price: 11000, icon: "🍾" },
  { id: "g-cup", name: "Kubok", stars: 100, price: 21000, icon: "🏆" },
  { id: "g-ring", name: "Uzuk", stars: 100, price: 21000, icon: "💍" },
  { id: "g-diamond", name: "Olmos", stars: 100, price: 21000, icon: "💎" }
];

// ---- Telegram Accounts (manual/admin flow, no API) ---------------------
const accountsInfo = {
  title: "🇺🇿 Telegram Akkauntlar",
  subtitle: "O‘zbekiston raqamli Telegram akkauntlari",
  startingPrice: 14000,
  steps: [
    "Kerakli akkauntni tanlang",
    "Admin bilan bog‘laning",
    "To‘lovni amalga oshiring",
    "Admin akkaunt ma’lumotlarini beradi",
    "Akkauntga kiring",
    "Akkaunt sizga to‘liq o‘tkaziladi"
  ]
};

// ---- Trust points (only real, non-invented claims) ----------------------
const trustPoints = [
  "Aniq narxlar",
  "Admin orqali yordam",
  "Qulay xarid",
  "Tezkor xizmat",
  "Qo‘llab-quvvatlash"
];

// ---- Prefilled admin messages per service --------------------------------
// These are sent exactly as-is when the user taps "Sotib olish" — the user
// never has to type anything themselves. Price is always included in the text.
const MESSAGES = {
  stars: (p) => `Assalomu alaykum, menga ${p.amount} stars kerak! Narxi: ${p.price.toLocaleString("ru-RU")} so'm.`,
  premium: (p) => `Assalomu alaykum, menga ${p.method} Telegram Premium kerak! Narxi: ${p.price.toLocaleString("ru-RU")} so'm.`,
  gift: (g) => `Assalomu alaykum, menga ${g.name} (${g.stars} ⭐) sovg‘asi kerak! Narxi: ${g.price.toLocaleString("ru-RU")} so'm.`,
  giftAnon: (g) => `Assalomu alaykum, do‘stimga anonim ${g.name} (${g.stars} ⭐) sovg‘a yubormoqchi edim. Narxi: ${g.price.toLocaleString("ru-RU")} so'm.`,
  accounts: () => `Assalomu alaykum, menga O‘zbekiston raqamli Telegram akkaunti kerak! Narxi: ${accountsInfo.startingPrice.toLocaleString("ru-RU")} so'mdan boshlanadi.`
};
 
