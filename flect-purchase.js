/*!
 * FLECT STARS — Purchase Redirect (Telegram admin)
 * Har bir mahsulot uchun "Sotib olish" bosilganda @flect_stars chatini
 * oldindan to'ldirilgan xabar bilan ochadi. Xabar avtomatik yuborilmaydi.
 *
 * Ulash:
 *   1) flect-purchase.js faylini sahifaga script tegi bilan ulang
 *   2) FlectPurchase.init({ getProduct: (id) => products.find(p => p.id == id) });
 *   <button data-buy="PRODUCT_ID">Sotib olish</button>
 *
 * Yoki to'g'ridan-to'g'ri: FlectPurchase.buy({ name: "50 Stars", price: 12000 })
 */
(function (global) {
  "use strict";

  var CONFIG = {
    username: "flect_stars",
  };

  /* ---------- Yordamchilar ---------- */

  function tg() {
    var w = global.Telegram && global.Telegram.WebApp;
    return w && w.platform && w.platform !== "unknown" ? w : null;
  }

  function haptic(type) {
    try {
      var w = tg();
      if (w && w.HapticFeedback) {
        type === "success"
          ? w.HapticFeedback.notificationOccurred("success")
          : w.HapticFeedback.impactOccurred(type || "light");
      }
    } catch (e) {}
  }

  // 12000 -> "12 000"
  function formatPrice(value) {
    var n = Math.round(Number(value));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function validPrice(value) {
    var n = Number(value);
    return isFinite(n) && n > 0;
  }

  // Mahsulot nomi: product.name, aks holda "quantity unit"
  function productName(p) {
    if (p.name) return String(p.name).trim();
    if (p.quantity && p.unit) return p.quantity + " " + p.unit;
    return String(p.title || "").trim();
  }

  function buildMessage(product) {
    var name = productName(product);
    var msg = "Assalomu alaykum, menga " + name + " kerak!";
    if (validPrice(product.price)) {
      msg += " Narxi: " + formatPrice(product.price) + " so'm.";
    }
    return msg;
  }

  function buildLink(text) {
    var encoded = encodeURIComponent(text).replace(/[!'()*]/g, function (c) {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
    return "https://t.me/" + CONFIG.username + "?text=" + encoded;
  }

  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy") ? resolve() : reject();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  /* ---------- Zaxira oyna (Liquid Glass bottom sheet) ---------- */

  var STYLE_ID = "flect-purchase-style";
  var CSS =
    ".fp-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;" +
    "background:rgba(4,12,30,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);" +
    "opacity:0;transition:opacity .28s ease}" +
    ".fp-overlay.fp-show{opacity:1}" +
    ".fp-sheet{width:100%;max-width:480px;margin:0 12px calc(12px + env(safe-area-inset-bottom));padding:22px 20px 18px;" +
    "border-radius:28px;color:#f4f8ff;font:15px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',system-ui,sans-serif;" +
    "background:linear-gradient(160deg,rgba(30,90,200,.55),rgba(8,24,60,.72));" +
    "border:1px solid rgba(180,225,255,.28);box-shadow:0 24px 60px rgba(0,20,60,.45),inset 0 1px 0 rgba(255,255,255,.25);" +
    "backdrop-filter:blur(28px) saturate(160%);-webkit-backdrop-filter:blur(28px) saturate(160%);" +
    "transform:translateY(40px) scale(.98);transition:transform .42s cubic-bezier(.2,.9,.25,1.15)}" +
    ".fp-show .fp-sheet{transform:none}" +
    ".fp-grip{width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,.35);margin:-8px auto 16px}" +
    ".fp-title{font-size:19px;font-weight:700;letter-spacing:-.2px;margin:0 0 4px}" +
    ".fp-sub{margin:0 0 14px;color:rgba(220,236,255,.75);font-size:14px}" +
    ".fp-msg{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);" +
    "font-size:15px;word-break:break-word;user-select:all;-webkit-user-select:all}" +
    ".fp-row{display:flex;gap:10px;margin-top:14px}" +
    ".fp-btn{flex:1;min-height:50px;border:0;border-radius:16px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:transform .15s ease,filter .2s}" +
    ".fp-btn:active{transform:scale(.96)}" +
    ".fp-primary{color:#fff;background:linear-gradient(135deg,#2f8bff,#1dd3f0);box-shadow:0 8px 22px rgba(30,140,255,.45)}" +
    ".fp-ghost{color:#eaf4ff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2)}" +
    ".fp-ok{background:linear-gradient(135deg,#21c07a,#3fe0a2)!important;color:#fff!important}" +
    ".fp-close{display:block;width:100%;margin-top:10px;padding:10px;border:0;background:none;color:rgba(220,236,255,.7);" +
    "font:500 14px inherit;font-family:inherit;cursor:pointer}" +
    "@media (prefers-reduced-motion:reduce){.fp-overlay,.fp-sheet{transition:none}}";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function showFallback(message, link, ready) {
    var title = ready ? "Xabar tayyor" : "Telegram ochilmadi";
    var sub = ready
      ? "Telegramni oching va @" + CONFIG.username + " chatida Yuborish tugmasini bosing."
      : "Xabarni nusxalang va @" + CONFIG.username + " ga yuboring.";
    injectStyle();
    var old = document.querySelector(".fp-overlay");
    if (old) old.remove();

    var el = document.createElement("div");
    el.className = "fp-overlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="fp-sheet">' +
      '<div class="fp-grip"></div>' +
      '<p class="fp-title">' + title + "</p>" +
      '<p class="fp-sub">' + esc(sub) + "</p>" +
      '<div class="fp-msg">' + esc(message) + "</div>" +
      '<div class="fp-row">' +
      '<button class="fp-btn fp-ghost" data-fp="copy">Nusxalash</button>' +
      '<a class="fp-btn fp-primary" data-fp="open" href="' + esc(link) + '" target="_blank" rel="noopener">Telegramni ochish</a>' +
      "</div>" +
      '<button class="fp-close" data-fp="close">Yopish</button>' +
      "</div>";

    function close() {
      el.classList.remove("fp-show");
      setTimeout(function () { el.remove(); }, 280);
    }

    el.addEventListener("click", function (e) {
      if (e.target === el) return close();
      var act = e.target.closest("[data-fp]");
      if (!act) return;
      var a = act.getAttribute("data-fp");
      if (a === "close") close();
      if (a === "copy") {
        copyText(message).then(function () {
          haptic("success");
          act.textContent = "Nusxalandi ✓";
          act.classList.add("fp-ok");
          setTimeout(function () {
            act.textContent = "Nusxalash";
            act.classList.remove("fp-ok");
          }, 1800);
        }, function () {
          act.textContent = "Qo'lda belgilang";
        });
      }
    });

    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("fp-show"); });
  }

  /* ---------- Asosiy funksiya ---------- */

  function buy(product) {
    if (!product || !productName(product)) {
      console.warn("[FlectPurchase] Mahsulot topilmadi:", product);
      return;
    }
    var message = buildMessage(product);
    var link = buildLink(message);
    haptic("medium");

    var w = tg();
    if (w && typeof w.openTelegramLink === "function") {
      // Mini App ichida — Telegram o'zi chatni ochadi
      try {
        w.openTelegramLink(link);
        return;
      } catch (e) {
        return showFallback(message, link);
      }
    }

    // Oddiy brauzer: popup bloklanmasligi uchun xabarni ko'rsatib,
    // haqiqiy havola tugmasini beramiz (foydalanuvchi o'zi bosadi)
    showFallback(message, link, true);
  }

  /* ---------- Avtomatik ulash ---------- */

  var bound = false;
  function init(opts) {
    opts = opts || {};
    if (opts.username) CONFIG.username = String(opts.username).replace(/^@/, "");
    var getProduct = opts.getProduct;
    if (bound) return;
    bound = true;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-buy]");
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute("data-buy");
      var product = typeof getProduct === "function" ? getProduct(id) : null;
      if (product && typeof product.then === "function") {
        product.then(buy);
      } else {
        buy(product);
      }
    });
  }

  global.FlectPurchase = {
    init: init,
    buy: buy,
    buildMessage: buildMessage,
    buildLink: buildLink,
    formatPrice: formatPrice,
  };
})(window);
