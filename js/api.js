/* FLECT STARS — Supabase bilan aloqa (mijoz ilovasi va admin panel uchun umumiy).
 *  - Mahsulotlar: REST + ochiq kalit (faqat o'qish).
 *  - Qolgan hammasi: Edge Functions (api, admin-api). Foydalanuvchi Telegram initData
 *    orqali serverda tekshiriladi; brauzer o'zi hech kimni "admin" qila olmaydi.
 */
(function (global) {
  "use strict";
  var C = global.FLECT_CONFIG || {};
  var TGW = global.Telegram && global.Telegram.WebApp;
  var TG = TGW && TGW.platform && TGW.platform !== "unknown" ? TGW : null;

  function ApiError(code, message, status) {
    this.code = code; this.message = message; this.status = status || 0;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function configured() {
    return !!(C.supabaseUrl && C.supabaseKey && C.supabaseUrl.indexOf("YOUR-") < 0 && C.supabaseKey.indexOf("YOUR-") < 0);
  }
  function base() { return String(C.supabaseUrl || "").replace(/\/$/, ""); }

  function request(url, opts) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (timer) clearTimeout(timer);
        return { res: res, body: body };
      });
    }, function () {
      if (timer) clearTimeout(timer);
      throw new ApiError("network", "Internet aloqasini tekshiring va qayta urinib ko'ring.");
    });
  }

  function products() {
    if (!configured()) return Promise.reject(new ApiError("not_configured", "Ilova hali sozlanmagan."));
    var url = base() + "/rest/v1/products?select=id,slug,category,title,message_name,subtitle,price_uzs,price_is_from,is_active,is_popular,tags,image,sort_order&order=category.asc,sort_order.asc,price_uzs.asc";
    return request(url, { headers: { apikey: C.supabaseKey, Accept: "application/json" } }).then(function (r) {
      if (!r.res.ok || !Array.isArray(r.body)) throw new ApiError("products_failed", "Mahsulotlarni yuklab bo'lmadi.", r.res.status);
      return r.body;
    });
  }

  function fn(name, action, payload) {
    if (!configured()) return Promise.reject(new ApiError("not_configured", "Ilova hali sozlanmagan."));
    if (!TG || !TG.initData) return Promise.reject(new ApiError("init_data_missing", "Ilovani Telegram ichida oching."));
    var body = Object.assign({ action: action }, payload || {});
    return request(base() + "/functions/v1/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseKey, "X-Telegram-Init-Data": TG.initData },
      body: JSON.stringify(body)
    }).then(function (r) {
      var b = r.body || {};
      if (!r.res.ok || !b.ok) throw new ApiError(b.error || "server_error", b.message || "Serverda xatolik.", r.res.status);
      return b.data;
    });
  }

  global.FlectAPI = {
    ApiError: ApiError,
    configured: configured,
    inTelegram: function () { return !!(TG && TG.initData); },
    products: products,
    me: function () { return fn("api", "me"); },
    createOrder: function (productId) { return fn("api", "create_order", { product_id: productId, quantity: 1 }); },
    myOrders: function (limit, offset) { return fn("api", "my_orders", { limit: limit || 50, offset: offset || 0 }); },
    admin: function (action, payload) { return fn("admin-api", action, payload); }
  };
})(window);
