// Telegram Mini App initData imzosini tekshirish va bot orqali xabar yuborish.
// Hujjat: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface InitData {
  user: TelegramUser;
  authDate: number;
  raw: string;
}

export class InitDataError extends Error {
  constructor(public code: "init_data_missing" | "init_data_invalid" | "init_data_expired", message: string) {
    super(message);
  }
}

const enc = new TextEncoder();

async function hmacSha256(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, enc.encode(data));
}

function toHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Vaqtga bog'liq bo'lmagan taqqoslash */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Testlar uchun: initData satrining imzosini hisoblaydi */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const dcs = Object.keys(fields).filter((k) => k !== "hash").sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = await hmacSha256(enc.encode("WebAppData"), botToken);
  return toHex(await hmacSha256(secret, dcs));
}

/**
 * initData'ni tekshiradi. Muvaffaqiyatsiz bo'lsa InitDataError tashlaydi.
 * Muhim: bu yerdan qaytgan `user` — ishonchli; brauzerdagi initDataUnsafe emas.
 */
export async function validateInitData(
  raw: string | null | undefined,
  botToken: string,
  maxAgeSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<InitData> {
  if (!raw) throw new InitDataError("init_data_missing", "Ilovani Telegram ichida oching.");
  if (raw.length > 8192) throw new InitDataError("init_data_invalid", "Telegram ma'lumoti noto'g'ri.");

  const params = new URLSearchParams(raw);
  const fields: Record<string, string> = {};
  for (const [k, v] of params) {
    if (k in fields) throw new InitDataError("init_data_invalid", "Telegram ma'lumoti noto'g'ri.");
    fields[k] = v;
  }

  const hash = fields.hash;
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new InitDataError("init_data_invalid", "Telegram ma'lumoti noto'g'ri.");
  }

  const expected = await signInitData(fields, botToken);
  if (!safeEqual(expected, hash)) {
    throw new InitDataError("init_data_invalid", "Telegram ma'lumoti tasdiqlanmadi.");
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new InitDataError("init_data_invalid", "Telegram ma'lumoti noto'g'ri.");
  }
  if (authDate > nowSeconds + 60) {
    throw new InitDataError("init_data_invalid", "Telegram ma'lumoti noto'g'ri.");
  }
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new InitDataError("init_data_expired", "Sessiya eskirdi. Ilovani yopib, qayta oching.");
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(fields.user ?? "");
  } catch {
    throw new InitDataError("init_data_invalid", "Telegram foydalanuvchisi aniqlanmadi.");
  }
  if (!user || typeof user !== "object" || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new InitDataError("init_data_invalid", "Telegram foydalanuvchisi aniqlanmadi.");
  }

  return { user, authDate, raw };
}

export type SendResult = "sent" | "blocked" | "failed";

/** Bot orqali oddiy matn (parse_mode yo'q => HTML/Markdown in'ektsiyasi yo'q) yuboradi */
export async function sendMessage(botToken: string, chatId: number | string, text: string): Promise<SendResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: ctl.signal,
    });
    if (res.ok) return "sent";
    // 403: bot bloklangan yoki foydalanuvchi /start bosmagan; 400 "chat not found" ham shu ma'noda
    if (res.status === 403) return "blocked";
    if (res.status === 400) {
      const b = await res.json().catch(() => null) as { description?: string } | null;
      if (b?.description && /chat not found|user is deactivated/i.test(b.description)) return "blocked";
    }
    console.error("telegram sendMessage failed", res.status);
    return "failed";
  } catch (e) {
    console.error("telegram sendMessage error", e instanceof Error ? e.name : "unknown");
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
