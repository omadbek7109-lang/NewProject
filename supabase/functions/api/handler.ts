// FLECT STARS — mijoz API (Edge Function: api)
//   me            -> { user, stats, is_admin }
//   create_order  -> { order, link }
//   my_orders     -> { orders, total }

import { ADMIN_TELEGRAM_ID, config, isAdmin } from "../_shared/config.ts";
import { authenticate, userPayload } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { action, AppError, corsHeaders, fail, int, ok, readBody, uuid } from "../_shared/http.ts";
import { sendMessage } from "../_shared/telegram.ts";

interface CustomerOrder {
  id: string;
  code: string;
  status: string;
  product_title: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface CreateOrderResult {
  order: CustomerOrder;
  message_name: string;
  customer: { id: number; username: string | null; first_name: string | null; last_name: string | null };
}

export function formatPrice(n: number): string {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Mijoz admin chatiga yuboradigan, oldindan to'ldirilgan xabar havolasi */
export function orderLink(adminUsername: string, r: CreateOrderResult): string {
  const o = r.order;
  const what = o.quantity > 1 ? `${o.quantity} × ${r.message_name}` : r.message_name;
  const text = `Assalomu alaykum, menga ${what} kerak! Narxi: ${
    formatPrice(o.total_price)
  } so'm. Buyurtma kodi: ${o.code}`;
  return `https://t.me/${adminUsername}?text=${encodeURIComponent(text)}`;
}

function adminNotice(r: CreateOrderResult): string {
  const c = r.customer;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Nomsiz";
  return [
    `🆕 Yangi buyurtma ${r.order.code}`,
    `Mahsulot: ${r.order.quantity > 1 ? r.order.quantity + " × " : ""}${r.order.product_title}`,
    `Summa: ${formatPrice(r.order.total_price)} so'm`,
    `Mijoz: ${name}${c.username ? " @" + c.username : ""} (ID ${c.id})`,
  ].join("\n");
}

function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", "Faqat POST.", 405);
    const body = await readBody(req);
    const act = action(body);
    const { user } = await authenticate(req);
    const p_user = userPayload(user);

    switch (act) {
      case "me": {
        const d = await rpc<Record<string, unknown>>("flect_api_me", { p_user });
        return ok(req, { ...d, is_admin: isAdmin(user.id) });
      }
      case "create_order": {
        const r = await rpc<CreateOrderResult>("flect_api_create_order", {
          p_user,
          p_product_id: uuid(body.product_id, "product_id"),
          p_quantity: int(body.quantity, 1, 1, 100),
        });
        background(sendMessage(config.botToken, ADMIN_TELEGRAM_ID, adminNotice(r)));
        return ok(req, { order: r.order, link: orderLink(config.adminUsername, r) });
      }
      case "my_orders": {
        const d = await rpc("flect_api_my_orders", {
          p_user,
          p_limit: int(body.limit, 50, 1, 100),
          p_offset: int(body.offset, 0, 0, 100000),
        });
        return ok(req, d);
      }
      default:
        throw new AppError("bad_action", "Noma'lum amal.");
    }
  } catch (e) {
    return fail(req, e);
  }
}
