// So'rov egasini aniqlash: faqat imzosi tekshirilgan Telegram initData orqali.

import { config, isAdmin } from "./config.ts";
import { AppError } from "./http.ts";
import { type InitData, InitDataError, type TelegramUser, validateInitData } from "./telegram.ts";

export async function authenticate(req: Request): Promise<InitData> {
  try {
    return await validateInitData(req.headers.get("X-Telegram-Init-Data"), config.botToken, config.initDataMaxAge);
  } catch (e) {
    if (e instanceof InitDataError) throw new AppError(e.code, e.message, 401);
    throw e;
  }
}

export async function authenticateAdmin(req: Request): Promise<InitData> {
  const d = await authenticate(req);
  if (!isAdmin(d.user.id)) {
    console.warn("admin-api: denied", d.user.id);
    throw new AppError("not_admin", "Bu Telegram akkauntida admin huquqi yo'q.", 403);
  }
  return d;
}

/** Bazaga faqat kerakli, tekshirilgan maydonlar yuboriladi */
export function userPayload(u: TelegramUser) {
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: u.id,
    username: s(u.username),
    first_name: s(u.first_name),
    last_name: s(u.last_name),
    language_code: s(u.language_code),
    photo_url: s(u.photo_url),
    is_premium: u.is_premium === true,
  };
}
