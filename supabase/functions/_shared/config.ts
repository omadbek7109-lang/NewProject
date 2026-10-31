// FLECT STARS — server sozlamalari (faqat Edge Functions ichida ishlatiladi).

/**
 * To'liq admin huquqiga ega YAGONA Telegram foydalanuvchi ID.
 * Ataylab kodga yozilgan: uni muhit o'zgaruvchisi yoki baza orqali o'zgartirib bo'lmaydi.
 */
export const ADMIN_TELEGRAM_ID = "7550418397";

export function isAdmin(telegramUserId: number | string): boolean {
  return String(telegramUserId) === ADMIN_TELEGRAM_ID;
}

/** Statistika uchun vaqt zonasi */
export const TIMEZONE = "Asia/Tashkent";

function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  /** Supabase avtomatik beradi */
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  /** Supabase avtomatik beradi. HECH QACHON javobga yoki logga chiqarilmaydi. */
  get serviceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** `supabase secrets set TELEGRAM_BOT_TOKEN=...` */
  get botToken() {
    return requireEnv("TELEGRAM_BOT_TOKEN");
  },
  /** Mijoz buyurtma xabarini yuboradigan Telegram username (@ siz) */
  get adminUsername() {
    return (env("ADMIN_USERNAME") ?? "flect_stars").replace(/^@/, "");
  },
  /** initData qancha vaqt amal qiladi (soniya). Standart: 24 soat. */
  get initDataMaxAge() {
    const n = Number(env("INIT_DATA_MAX_AGE") ?? "86400");
    return Number.isFinite(n) && n >= 60 ? n : 86400;
  },
  /** Vergul bilan ajratilgan ruxsat etilgan Origin'lar. Bo'sh bo'lsa: "*" */
  get allowedOrigins(): string[] {
    return (env("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
};
