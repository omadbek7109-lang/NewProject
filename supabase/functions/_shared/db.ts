// Postgres funksiyalarini (flect_*) PostgREST orqali service_role bilan chaqirish.
// service_role kaliti faqat shu yerda, server ichida ishlatiladi.

import { config } from "./config.ts";
import { AppError } from "./http.ts";

// SQL'dagi `raise exception using message = '<kod>'` kodlari -> HTTP status
const STATUS: Record<string, number> = {
  bad_user: 400,
  bad_request: 400,
  bad_quantity: 400,
  bad_status: 400,
  bad_timezone: 400,
  note_too_long: 400,
  reason_required: 400,
  invalid_product: 400,
  use_confirm_payment: 400,
  product_unavailable: 409,
  invalid_transition: 409,
  payment_required: 409,
  already_paid: 409,
  slug_taken: 409,
  order_not_found: 404,
  product_not_found: 404,
  too_many_orders: 429,
  too_many_open_orders: 429,
};

interface PgError {
  code?: string;
  message?: string;
  hint?: string | null;
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!/^flect_[a-z_]+$/.test(fn)) throw new Error("bad rpc name");
  const key = config.serviceRoleKey;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    apikey: key,
  };
  // Eski (JWT) service_role kaliti Authorization'da ham kerak; yangi sb_secret_ kaliti uchun apikey yetarli.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: ctl.signal,
    });
  } catch (e) {
    throw new Error(`rpc ${fn} network: ${e instanceof Error ? e.name : "unknown"}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (res.ok) return body as T;

  const err = (body ?? {}) as PgError;
  if (err.code === "P0001" && err.message && err.message in STATUS) {
    throw new AppError(err.message, err.hint || "Xatolik.", STATUS[err.message]);
  }
  if (err.code === "22P02") throw new AppError("bad_request", "So'rov noto'g'ri.", 400);
  throw new Error(`rpc ${fn} failed: ${res.status} ${err.code ?? ""} ${err.message ?? ""}`);
}
