// HTTP yordamchilari: CORS, JSON javoblar, xatolar, so'rovni o'qish.

import { config } from "./config.ts";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-telegram-init-data";

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = config.allowedOrigins;
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed.length === 0) {
    // Auth cookie emas, imzolangan initData orqali: "*" xavfsiz.
    h["Access-Control-Allow-Origin"] = "*";
  } else if (allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const ok = (req: Request, data: unknown) => json(req, 200, { ok: true, data });

export function fail(req: Request, e: unknown): Response {
  if (e instanceof AppError) {
    return json(req, e.status, { ok: false, error: e.code, message: e.message });
  }
  // Ichki tafsilotlar (kalitlar, SQL) mijozga chiqmaydi
  console.error("unhandled", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  return json(req, 500, { ok: false, error: "server_error", message: "Serverda xatolik. Keyinroq urinib ko'ring." });
}

const MAX_BODY = 16 * 1024;

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY) throw new AppError("payload_too_large", "So'rov juda katta.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) throw new AppError("payload_too_large", "So'rov juda katta.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    throw new AppError("bad_request", "So'rov noto'g'ri.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("bad_request", "So'rov noto'g'ri.");
  }
  return body as Record<string, unknown>;
}

// ---- Kiruvchi qiymatlarni tekshirish ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(v: unknown, field: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new AppError("bad_request", `${field} noto'g'ri.`);
  return v.toLowerCase();
}

export function optUuid(v: unknown, field: string): string | null {
  return v == null || v === "" ? null : uuid(v, field);
}

export function int(v: unknown, def: number, min: number, max: number): number {
  if (v == null) return def;
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isInteger(n)) throw new AppError("bad_request", "Son noto'g'ri.");
  return Math.min(Math.max(n, min), max);
}

export function optStr(v: unknown, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string") throw new AppError("bad_request", "Matn noto'g'ri.");
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export function bool(v: unknown, def = false): boolean {
  return typeof v === "boolean" ? v : def;
}

export function action(body: Record<string, unknown>): string {
  const a = body.action;
  if (typeof a !== "string" || !/^[a-z_]{1,32}$/.test(a)) throw new AppError("bad_action", "Noma'lum amal.");
  return a;
}
