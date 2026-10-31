-- FLECT STARS — asosiy sxema: jadvallar, indekslar, RLS va huquqlar.
--
-- Xavfsizlik modeli:
--   * Brauzer (anon / authenticated, ya'ni publishable kalit) faqat `products`
--     jadvalidan arxivlanmagan mahsulotlarni va faqat ochiq ustunlarni O'QIY oladi.
--   * Qolgan barcha jadvallar brauzer uchun butunlay yopiq (RLS yoqilgan, siyosat yo'q,
--     huquqlar olib tashlangan).
--   * Yozish va shaxsiy ma'lumotlar faqat Edge Functions (`api`, `admin-api`) orqali:
--     ular Telegram initData imzosini tekshiradi va service_role bilan ishlaydi.

-- ---------------------------------------------------------------------------
-- Umumiy: updated_at ni avtomatik yangilash
-- ---------------------------------------------------------------------------
create or replace function public.flect_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mahsulotlar
-- ---------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  category      text not null
                check (category in ('stars', 'premium', 'accounts', 'gifts', 'nft')),
  title         text not null
                check (char_length(btrim(title)) between 1 and 120),
  message_name  text not null
                check (char_length(btrim(message_name)) between 1 and 120),
  subtitle      text
                check (subtitle is null or char_length(subtitle) <= 200),
  price_uzs     bigint not null
                check (price_uzs between 1 and 1000000000),
  price_is_from boolean not null default false,
  is_active     boolean not null default true,
  is_popular    boolean not null default false,
  tags          text[] not null default '{}'
                check (cardinality(tags) <= 10),
  -- Rasm: https:// havola, img/... dagi lokal fayl yoki qisqa emoji.
  -- Frontend ham xuddi shu shablon bo'yicha <img> chiqaradi; boshqa hamma narsa matn sifatida (escape qilinib) ko'rsatiladi.
  image         text
                check (
                  image is null
                  or image ~ '^https://[^[:space:]"''<>\\]+$'
                  or image ~* '^img/[a-z0-9/_-]+\.(webp|png|jpe?g|svg)$'
                  or (char_length(image) <= 16 and image !~ '[[:space:]<>"''&\\]')
                ),
  sort_order    integer not null default 0
                check (sort_order between -100000 and 100000),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.products is 'Katalog. Brauzer faqat arxivlanmagan mahsulotlarni o''qiydi.';

-- Slug faqat "tirik" (arxivlanmagan) mahsulotlar orasida noyob: arxivlangan slugni qayta ishlatish mumkin.
create unique index products_slug_live_uniq on public.products (slug) where archived_at is null;
create index products_catalog_idx on public.products (category, sort_order, price_uzs) where archived_at is null;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.flect_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Telegram foydalanuvchilari (id = Telegram user id)
-- ---------------------------------------------------------------------------
create table public.tg_users (
  id             bigint primary key check (id > 0),
  username       text check (username is null or char_length(username) <= 64),
  first_name     text check (first_name is null or char_length(first_name) <= 128),
  last_name      text check (last_name is null or char_length(last_name) <= 128),
  photo_url      text check (photo_url is null or char_length(photo_url) <= 512),
  language_code  text check (language_code is null or char_length(language_code) <= 16),
  is_premium     boolean not null default false,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index tg_users_created_idx   on public.tg_users (created_at);
create index tg_users_last_seen_idx on public.tg_users (last_seen_at);
create index tg_users_username_idx  on public.tg_users (lower(username));

-- ---------------------------------------------------------------------------
-- Buyurtmalar
--   new        — yangi
--   paid       — to'lov tasdiqlangan
--   processing — bajarilmoqda
--   completed  — bajarilgan
--   cancelled  — bekor qilingan
-- ---------------------------------------------------------------------------
create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^FS-[0-9A-F]{8}$'),
  user_id               bigint not null references public.tg_users (id) on delete restrict,
  product_id            uuid not null references public.products (id) on delete restrict,
  -- Buyurtma paytidagi nusxa: keyin mahsulot o'zgarsa ham tarix buzilmaydi
  product_title         text not null,
  product_slug          text not null,
  category              text not null,
  unit_price            bigint not null check (unit_price > 0),
  quantity              integer not null default 1 check (quantity between 1 and 100),
  total_price           bigint not null,
  status                text not null default 'new'
                        check (status in ('new', 'paid', 'processing', 'completed', 'cancelled')),
  payment_confirmed     boolean not null default false,
  payment_confirmed_at  timestamptz,
  payment_confirmed_by  bigint,
  cancel_reason         text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint orders_total_matches   check (total_price = unit_price * quantity),
  constraint orders_paid_has_payment check (status not in ('paid', 'completed') or payment_confirmed),
  constraint orders_payment_fields  check (payment_confirmed = (payment_confirmed_at is not null)),
  constraint orders_completed_at    check ((status = 'completed') = (completed_at is not null)),
  constraint orders_cancelled_at    check ((status = 'cancelled') = (cancelled_at is not null))
);

create index orders_user_created_idx   on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_created_idx        on public.orders (created_at desc);
create index orders_revenue_idx        on public.orders (completed_at)
  where status = 'completed' and payment_confirmed;
create index orders_product_idx        on public.orders (product_id);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.flect_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Buyurtma tarixi (audit)
-- ---------------------------------------------------------------------------
create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  actor        text not null check (actor in ('customer', 'admin', 'system')),
  actor_id     bigint,
  from_status  text,
  to_status    text not null,
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at, id);

-- ---------------------------------------------------------------------------
-- RLS va huquqlar
-- ---------------------------------------------------------------------------
alter table public.products     enable row level security;
alter table public.tg_users     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_events enable row level security;

-- Supabase standart huquqlarini olib tashlaymiz, keyin faqat keraklisini qaytaramiz.
revoke all on table public.products, public.tg_users, public.orders, public.order_events
  from public, anon, authenticated;

-- Mahsulotlar: faqat o'qish, faqat ochiq ustunlar, faqat arxivlanmaganlar.
grant select (id, slug, category, title, message_name, subtitle, price_uzs, price_is_from,
              is_active, is_popular, tags, image, sort_order)
  on table public.products to anon, authenticated;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (archived_at is null);

-- tg_users, orders, order_events: brauzer uchun siyosat YO'Q => RLS hamma narsani yopadi.

-- Server (Edge Functions) service_role bilan ishlaydi; u RLS'ni chetlab o'tadi.
grant all on table public.products, public.tg_users, public.orders, public.order_events to service_role;

revoke all on sequence public.order_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.order_events_id_seq to service_role;

revoke all on function public.flect_touch_updated_at() from public, anon, authenticated;
