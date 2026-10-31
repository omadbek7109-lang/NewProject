# FLECT STARS — backend (Supabase)

```
supabase/
├── config.toml                     # Edge Functions: verify_jwt = false (auth = Telegram initData)
├── migrations/
│   ├── 20261031000001_schema.sql   # jadvallar, indekslar, RLS, huquqlar
│   └── 20261031000002_rpc.sql      # server mantiqi (flect_* funksiyalari)
└── functions/
    ├── _shared/                    # config, initData tekshiruvi, HTTP, DB (RPC)
    ├── api/                        # mijoz: me, create_order, my_orders
    ├── admin-api/                  # admin: whoami, stats, orders_*, products_*
    └── tests/                      # deno test
```

## Xavfsizlik modeli

| Kim | Nima qila oladi |
|---|---|
| Brauzer (publishable/anon kalit) | Faqat `products` jadvalidagi **arxivlanmagan** mahsulotlarni va faqat ochiq ustunlarni o'qiydi. `tg_users`, `orders`, `order_events` va barcha `flect_*` funksiyalari yopiq. |
| `api` Edge Function | `X-Telegram-Init-Data` imzosini bot tokeni bilan HMAC-SHA256 orqali tekshiradi, muddati 24 soat. Foydalanuvchi faqat **o'z** buyurtmalarini ko'radi va yaratadi. |
| `admin-api` Edge Function | Imzo tekshirilgandan keyin `user.id === 7550418397` bo'lishi shart. ID kodga yozilgan (`_shared/config.ts`), uni baza yoki muhit o'zgaruvchisi orqali o'zgartirib bo'lmaydi. |
| `service_role` kaliti | Faqat Edge Functions ichida ishlatiladi (`SUPABASE_SERVICE_ROLE_KEY`, Supabase uni o'zi beradi). Frontendda ham, repoda ham yo'q. |

Qo'shimcha himoyalar:
- **Spamga qarshi:** 10 daqiqada 5 tadan ko'p buyurtma berib bo'lmaydi; bir vaqtda 10 tadan ko'p "new" buyurtma ham bo'lmaydi.
- **Narx:** buyurtma narxi faqat serverda, bazadagi narxdan olinadi.
- **Nusxa:** buyurtma paytidagi mahsulot nomi va narxi buyurtmaga saqlanadi.
- **Tarix:** har bir o'zgarish `order_events` jadvaliga yoziladi.

## Buyurtma holatlari

| Holat | Ma'nosi |
|---|---|
| `new` | yangi |
| `paid` | to'lov tasdiqlangan |
| `processing` | bajarilmoqda |
| `completed` | bajarilgan |
| `cancelled` | bekor qilingan |

```
new ──(to'lovni tasdiqlash)──► paid ──► processing ──► completed
 │                              │            │
 └──► processing ───────────────┼────────────┤
                                ▼            ▼
                    cancelled (har qanday yakunlanmagan holatdan, sabab majburiy)
```

- `completed` faqat to'lov tasdiqlangan bo'lsa (`payment_confirmed = true`).
- `processing` holatidagi to'lanmagan buyurtma uchun to'lovni tasdiqlasa, holat o'zgarmaydi, faqat to'lov belgilanadi.
- Statistikadagi tushum = `completed` + to'lov tasdiqlangan buyurtmalar (bajarilgan sanasi bo'yicha, Asia/Tashkent).

## Deploy (tekshiruvdan keyin)

1. Supabase CLI: `npm i -g supabase` (yoki `brew install supabase/tap/supabase`).
2. Ulash:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```
3. Bazani yaratish:
   ```bash
   supabase db push
   ```
4. Maxfiy sozlamalar (faqat serverda saqlanadi):
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=<BotFather bergan token>
   # ixtiyoriy:
   supabase secrets set ADMIN_USERNAME=flect_stars                    # mijoz yozadigan akkaunt
   supabase secrets set ALLOWED_ORIGINS=https://sizning-sayt.uz       # CORS cheklovi
   ```
   Bot tokeni Mini App'ni ochadigan bot tokeni bilan **bir xil** bo'lishi shart, aks holda imzo mos kelmaydi.
5. Funksiyalarni deploy qilish:
   ```bash
   supabase functions deploy api
   supabase functions deploy admin-api
   ```
   `config.toml` faylida `verify_jwt = false` turibdi, chunki frontend Supabase JWT yubormaydi.
6. `js/config.js` fayliga **faqat** loyiha URL'i va publishable (yoki anon) kalitini yozing (Project Settings → API).
7. Bot orqali xabar olish uchun admin ham, mijozlar ham botda `/start` bosgan bo'lishi kerak.

Mahsulotlarni admin paneldan qo'shing: Profil → Admin panel → Mahsulotlar.

## Testlar

```bash
deno test --allow-env supabase/functions/tests/
```
