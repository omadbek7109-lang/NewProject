// FLECT STARS — admin API (Edge Function: admin-api)
// Har bir so'rov: initData imzosi tekshiriladi, keyin user.id === ADMIN_TELEGRAM_ID bo'lishi shart.
//
//   whoami, stats, orders_list, order_history, confirm_payment, order_status,
//   products_list, product_save, product_archive

import { config, TIMEZONE } from "../_shared/config.ts";
import { authenticateAdmin } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import {
  action,
  AppError,
  bool,
  corsHeaders,
  fail,
  int,
  ok,
  optStr,
  optUuid,
  readBody,
  uuid,
} from "../_shared/http.ts";
import { sendMessage, type SendResult } from "../_shared/telegram.ts";

const ORDER_STATUSES = ["new", "paid", "processing", "completed", "cancelled"];

interface AdminOrder {
  id: string;
  code: string;
  user_id: number;
  status: string;
  product_title: string;
  quantity: number;
  cancel_reason: string | null;
}

export function customerNotice(o: AdminOrder): string | null {
  const what = (o.quantity > 1 ? `${o.quantity} × ` : "") + o.product_title;
  switch (o.status) {
    case "processing":
      return `🔄 ${o.code} buyurtmangiz bajarilmoqda.\n${what}`;
    case "completed":
      return `✅ ${o.code} buyurtmangiz bajarildi.\n${what}\n\nXaridingiz uchun rahmat!`;
    case "cancelled":
      return `❌ ${o.code} buyurtmangiz bekor qilindi.\n${what}` +
        (o.cancel_reason ? `\nSabab: ${o.cancel_reason}` : "");
    default:
      return null;
  }
}

function status(v: unknown, allowNull: boolean): string | null {
  const s = optStr(v, 16);
  if (s === null && allowNull) return null;
  if (s === null || !ORDER_STATUSES.includes(s)) throw new AppError("bad_status", "Holat noto'g'ri.");
  return s;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", "Faqat POST.", 405);
    const body = await readBody(req);
    const act = action(body);
    const { user } = await authenticateAdmin(req);
    const adminId = user.id;

    switch (act) {
      case "whoami":
        return ok(req, { id: user.id, username: user.username ?? null, first_name: user.first_name ?? null });

      case "stats":
        return ok(req, await rpc("flect_admin_stats", { p_tz: TIMEZONE }));

      case "orders_list":
        return ok(
          req,
          await rpc("flect_admin_orders_list", {
            p_status: status(body.status, true),
            p_search: optStr(body.search, 64),
            p_limit: int(body.limit, 30, 1, 100),
            p_offset: int(body.offset, 0, 0, 100000),
          }),
        );

      case "order_history":
        return ok(req, await rpc("flect_admin_order_history", { p_order_id: uuid(body.order_id, "order_id") }));

      case "confirm_payment":
        return ok(
          req,
          await rpc("flect_admin_confirm_payment", {
            p_order_id: uuid(body.order_id, "order_id"),
            p_admin_id: adminId,
          }),
        );

      case "order_status": {
        const order = await rpc<AdminOrder>("flect_admin_set_status", {
          p_order_id: uuid(body.order_id, "order_id"),
          p_status: status(body.status, false),
          p_note: optStr(body.note, 500),
          p_admin_id: adminId,
        });
        let notification: SendResult | null = null;
        if (bool(body.notify_customer)) {
          const text = customerNotice(order);
          if (text) notification = await sendMessage(config.botToken, order.user_id, text);
        }
        return ok(req, { order, notification });
      }

      case "products_list":
        return ok(req, await rpc("flect_admin_products_list", { p_include_archived: bool(body.include_archived) }));

      case "product_save": {
        const data = body.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new AppError("bad_request", "Mahsulot ma'lumoti yuborilmadi.");
        }
        return ok(req, await rpc("flect_admin_product_save", { p_id: optUuid(body.id, "id"), p_data: data }));
      }

      case "product_archive":
        return ok(req, await rpc("flect_admin_product_archive", { p_id: uuid(body.id, "id") }));

      default:
        throw new AppError("bad_action", "Noma'lum amal.");
    }
  } catch (e) {
    return fail(req, e);
  }
}
