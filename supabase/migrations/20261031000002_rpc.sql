-- FLECT STARS — server mantiqi (Postgres funksiyalari).
--
-- Bu funksiyalarni FAQAT Edge Functions (service_role) chaqiradi. Brauzer (anon/authenticated)
-- ularni chaqira olmaydi: fayl oxirida EXECUTE huquqi olib tashlanadi.
-- Foydalanuvchi kimligi (Telegram id) va admin huquqi Edge Function ichida initData imzosi
-- orqali aniqlanadi va bu yerga argument sifatida beriladi.
--
-- Xatolar: `raise exception using message = '<kod>', hint = '<foydalanuvchiga matn>'`.
-- Edge Function kodni `error`, matnni `message` sifatida frontendga qaytaradi.

-- ---------------------------------------------------------------------------
-- Ko'rinish: admin uchun buyurtma + mijoz
-- ---------------------------------------------------------------------------
create view public.flect_order_items
with (security_invoker = true) as
select o.id, o.code, o.user_id, o.product_id, o.product_title, o.product_slug, o.category,
       o.unit_price, o.quantity, o.total_price, o.status,
       o.payment_confirmed, o.payment_confirmed_at, o.payment_confirmed_by,
       o.cancel_reason, o.completed_at, o.cancelled_at, o.created_at, o.updated_at,
       u.username, u.first_name, u.last_name
from public.orders o
join public.tg_users u on u.id = o.user_id;

revoke all on table public.flect_order_items from public, anon, authenticated;
grant select on table public.flect_order_items to service_role;

-- ---------------------------------------------------------------------------
-- Yordamchilar
-- ---------------------------------------------------------------------------

-- Telegram foydalanuvchisini yozish/yangilash. Satr tranzaksiya oxirigacha qulflanadi
-- (bir foydalanuvchining parallel buyurtmalari ketma-ket bajariladi).
create or replace function public.flect_upsert_user(p_user jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_photo text;
begin
  if p_user is null or jsonb_typeof(p_user -> 'id') is distinct from 'number'
     or (p_user ->> 'id') !~ '^[1-9][0-9]{0,17}$' then
    raise exception using message = 'bad_user', hint = 'Telegram foydalanuvchisi aniqlanmadi.';
  end if;
  v_id := (p_user ->> 'id')::bigint;
  v_photo := p_user ->> 'photo_url';
  if v_photo is not null and (v_photo !~ '^https://' or char_length(v_photo) > 512) then
    v_photo := null;
  end if;

  insert into public.tg_users as t (id, username, first_name, last_name, photo_url, language_code, is_premium)
  values (
    v_id,
    left(nullif(btrim(p_user ->> 'username'), ''), 64),
    left(nullif(btrim(p_user ->> 'first_name'), ''), 128),
    left(nullif(btrim(p_user ->> 'last_name'), ''), 128),
    v_photo,
    left(nullif(btrim(p_user ->> 'language_code'), ''), 16),
    coalesce((p_user -> 'is_premium') = 'true'::jsonb, false)
  )
  on conflict (id) do update
    set username      = excluded.username,
        first_name    = excluded.first_name,
        last_name     = excluded.last_name,
        photo_url     = excluded.photo_url,
        language_code = excluded.language_code,
        is_premium    = excluded.is_premium,
        last_seen_at  = now();
  return v_id;
end;
$$;

-- Mijozga ko'rsatiladigan buyurtma ko'rinishi
create or replace function public.flect_customer_order(o public.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'status', o.status,
    'product_id', o.product_id,
    'product_title', o.product_title,
    'quantity', o.quantity,
    'unit_price', o.unit_price,
    'total_price', o.total_price,
    'payment_confirmed', o.payment_confirmed,
    'cancel_reason', o.cancel_reason,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  );
$$;

-- Admin uchun bitta buyurtma (ro'yxatdagi shakl bilan bir xil)
create or replace function public.flect_admin_order(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(v) from public.flect_order_items v where v.id = p_order_id;
$$;

create or replace function public.flect_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'new' then 'Yangi'
    when 'paid' then 'To''lov tasdiqlangan'
    when 'processing' then 'Bajarilmoqda'
    when 'completed' then 'Bajarilgan'
    when 'cancelled' then 'Bekor qilingan'
    else p_status
  end;
$$;

-- ===========================================================================
-- MIJOZ (api)
-- ===========================================================================

create or replace function public.flect_api_me(p_user jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid bigint;
  v_user jsonb;
  v_stats jsonb;
  v_purchased jsonb;
begin
  v_uid := public.flect_upsert_user(p_user);

  select jsonb_build_object('id', u.id, 'username', u.username, 'first_name', u.first_name,
                            'last_name', u.last_name, 'photo_url', u.photo_url)
    into v_user
    from public.tg_users u where u.id = v_uid;

  select jsonb_build_object(
           'orders_total', count(*),
           'new',          count(*) filter (where o.status = 'new'),
           'paid',         count(*) filter (where o.status = 'paid'),
           'processing',   count(*) filter (where o.status = 'processing'),
           'completed',    count(*) filter (where o.status = 'completed'),
           'cancelled',    count(*) filter (where o.status = 'cancelled'))
    into v_stats
    from public.orders o where o.user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object('title', s.title, 'count', s.cnt) order by s.cnt desc, s.title), '[]'::jsonb)
    into v_purchased
    from (select o.product_title as title, sum(o.quantity)::int as cnt
            from public.orders o
           where o.user_id = v_uid and o.status = 'completed'
           group by o.product_title) s;

  return jsonb_build_object('user', v_user, 'stats', v_stats || jsonb_build_object('purchased', v_purchased));
end;
$$;

create or replace function public.flect_api_create_order(p_user jsonb, p_product_id uuid, p_quantity integer default 1)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid bigint;
  v_p public.products%rowtype;
  v_o public.orders%rowtype;
  v_code text;
  v_cnt integer;
  v_try integer := 0;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using message = 'bad_quantity', hint = 'Miqdor noto''g''ri.';
  end if;

  v_uid := public.flect_upsert_user(p_user);  -- foydalanuvchi satri qulflanadi

  select * into v_p from public.products p
   where p.id = p_product_id and p.archived_at is null and p.is_active
   for share;
  if not found then
    raise exception using message = 'product_unavailable', hint = 'Bu mahsulot hozir sotuvda yo''q.';
  end if;

  -- Spamdan himoya
  select count(*) into v_cnt from public.orders o
   where o.user_id = v_uid and o.created_at > now() - interval '10 minutes';
  if v_cnt >= 5 then
    raise exception using message = 'too_many_orders',
      hint = 'Juda ko''p buyurtma berildi. Birozdan keyin qayta urinib ko''ring.';
  end if;

  select count(*) into v_cnt from public.orders o
   where o.user_id = v_uid and o.status = 'new';
  if v_cnt >= 10 then
    raise exception using message = 'too_many_open_orders',
      hint = 'Sizda tasdiqlanmagan buyurtmalar ko''p. Admin ularni ko''rib chiqishini kuting.';
  end if;

  loop
    v_try := v_try + 1;
    v_code := 'FS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.orders (code, user_id, product_id, product_title, product_slug, category,
                                 unit_price, quantity, total_price)
      values (v_code, v_uid, v_p.id, v_p.title, v_p.slug, v_p.category,
              v_p.price_uzs, p_quantity, v_p.price_uzs * p_quantity)
      returning * into v_o;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  insert into public.order_events (order_id, actor, actor_id, from_status, to_status)
  values (v_o.id, 'customer', v_uid, null, 'new');

  return jsonb_build_object(
    'order', public.flect_customer_order(v_o),
    'message_name', v_p.message_name,
    'customer', (select jsonb_build_object('id', u.id, 'username', u.username,
                                           'first_name', u.first_name, 'last_name', u.last_name)
                   from public.tg_users u where u.id = v_uid)
  );
end;
$$;

create or replace function public.flect_api_my_orders(p_user jsonb, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_total integer;
  v_items jsonb;
begin
  v_uid := public.flect_upsert_user(p_user);
  select count(*) into v_total from public.orders o where o.user_id = v_uid;
  select coalesce(jsonb_agg(public.flect_customer_order(x) order by x.created_at desc, x.id), '[]'::jsonb)
    into v_items
    from (select * from public.orders o
           where o.user_id = v_uid
           order by o.created_at desc, o.id
           limit v_limit offset v_offset) x;
  return jsonb_build_object('orders', v_items, 'total', v_total);
end;
$$;

-- ===========================================================================
-- ADMIN (admin-api). Admin huquqi Edge Function'da tekshiriladi.
-- ===========================================================================

create or replace function public.flect_admin_stats(p_tz text default 'Asia/Tashkent')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date;
  v_month date;
  v_summary jsonb;
  v_users jsonb;
  v_daily jsonb;
  v_monthly jsonb;
  v_top jsonb;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception using message = 'bad_timezone', hint = 'Vaqt zonasi noto''g''ri.';
  end if;
  v_today := (now() at time zone p_tz)::date;
  v_month := date_trunc('month', v_today)::date;

  select jsonb_build_object(
           'revenue_confirmed', coalesce(sum(o.total_price) filter (where o.status = 'completed' and o.payment_confirmed), 0),
           'orders_total',      count(*),
           'orders_new',        count(*) filter (where o.status = 'new'),
           'orders_paid',       count(*) filter (where o.status = 'paid'),
           'orders_processing', count(*) filter (where o.status = 'processing'),
           'orders_completed',  count(*) filter (where o.status = 'completed'),
           'orders_cancelled',  count(*) filter (where o.status = 'cancelled'))
    into v_summary
    from public.orders o;

  select jsonb_build_object(
           'users_total',      count(*),
           'users_new_today',  count(*) filter (where (u.created_at at time zone p_tz)::date = v_today),
           'users_new_7d',     count(*) filter (where u.created_at > now() - interval '7 days'),
           'users_new_30d',    count(*) filter (where u.created_at > now() - interval '30 days'),
           'users_active_7d',  count(*) filter (where u.last_seen_at > now() - interval '7 days'),
           'users_active_30d', count(*) filter (where u.last_seen_at > now() - interval '30 days'))
    into v_users
    from public.tg_users u;

  -- Oxirgi 30 kun (bajarilgan va to'lovi tasdiqlangan buyurtmalar, bajarilgan sanasi bo'yicha)
  select jsonb_agg(jsonb_build_object('period', to_char(d.day, 'YYYY-MM-DD'),
                                      'revenue', coalesce(r.revenue, 0),
                                      'orders', coalesce(r.orders, 0)) order by d.day)
    into v_daily
    from (select v_today - 29 + g as day from generate_series(0, 29) g) d
    left join (
      select (o.completed_at at time zone p_tz)::date as day, sum(o.total_price) as revenue, count(*) as orders
        from public.orders o
       where o.status = 'completed' and o.payment_confirmed
         and o.completed_at >= ((v_today - 29)::timestamp at time zone p_tz)
       group by 1
    ) r on r.day = d.day;

  -- Oxirgi 12 oy
  select jsonb_agg(jsonb_build_object('period', to_char(m.month, 'YYYY-MM-DD'),
                                      'revenue', coalesce(r.revenue, 0),
                                      'orders', coalesce(r.orders, 0)) order by m.month)
    into v_monthly
    from (select (v_month - make_interval(months => 11 - g))::date as month from generate_series(0, 11) g) m
    left join (
      select date_trunc('month', o.completed_at at time zone p_tz)::date as month,
             sum(o.total_price) as revenue, count(*) as orders
        from public.orders o
       where o.status = 'completed' and o.payment_confirmed
         and o.completed_at >= ((v_month - interval '11 months')::timestamp at time zone p_tz)
       group by 1
    ) r on r.month = m.month;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', t.product_id, 'title', t.title,
                                               'quantity', t.quantity, 'revenue', t.revenue)
                            order by t.quantity desc, t.revenue desc), '[]'::jsonb)
    into v_top
    from (select o.product_id,
                 (array_agg(o.product_title order by o.created_at desc))[1] as title,
                 sum(o.quantity) as quantity,
                 sum(o.total_price) as revenue
            from public.orders o
           where o.status = 'completed' and o.payment_confirmed
           group by o.product_id
           order by sum(o.quantity) desc, sum(o.total_price) desc
           limit 10) t;

  return jsonb_build_object(
    'summary', v_summary || v_users || jsonb_build_object('timezone', p_tz),
    'daily', v_daily,
    'monthly', v_monthly,
    'top', v_top
  );
end;
$$;

create or replace function public.flect_admin_orders_list(
  p_status text default null, p_search text default null,
  p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_q text := left(nullif(btrim(p_search), ''), 64);
  v_like text;
  v_ulike text;
  v_num bigint;
  v_total integer;
  v_items jsonb;
begin
  if p_status is not null and p_status not in ('new', 'paid', 'processing', 'completed', 'cancelled') then
    raise exception using message = 'bad_status', hint = 'Holat noto''g''ri.';
  end if;
  if v_q is not null then
    v_like  := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_ulike := '%' || replace(replace(replace(ltrim(v_q, '@'), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_q ~ '^[0-9]{1,18}$' then v_num := v_q::bigint; end if;
  end if;

  select count(*) into v_total
    from public.flect_order_items v
   where (p_status is null or v.status = p_status)
     and (v_q is null
          or v.code ilike v_like
          or v.username ilike v_ulike
          or concat_ws(' ', v.first_name, v.last_name) ilike v_like
          or v.product_title ilike v_like
          or v.user_id = v_num);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb)
    into v_items
    from (select * from public.flect_order_items v
           where (p_status is null or v.status = p_status)
             and (v_q is null
                  or v.code ilike v_like
                  or v.username ilike v_ulike
                  or concat_ws(' ', v.first_name, v.last_name) ilike v_like
                  or v.product_title ilike v_like
                  or v.user_id = v_num)
           order by v.created_at desc, v.id
           limit v_limit offset v_offset) x;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.flect_admin_order_history(p_order_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id) then
    raise exception using message = 'order_not_found', hint = 'Buyurtma topilmadi.';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('actor', e.actor, 'actor_id', e.actor_id,
                                                 'from_status', e.from_status, 'to_status', e.to_status,
                                                 'note', e.note, 'created_at', e.created_at)
                              order by e.created_at, e.id), '[]'::jsonb)
      from public.order_events e where e.order_id = p_order_id
  );
end;
$$;

create or replace function public.flect_admin_confirm_payment(p_order_id uuid, p_admin_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_o public.orders%rowtype;
  v_to text;
begin
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception using message = 'order_not_found', hint = 'Buyurtma topilmadi.';
  end if;
  if v_o.status = 'cancelled' then
    raise exception using message = 'invalid_transition',
      hint = 'Bekor qilingan buyurtma uchun to''lovni tasdiqlab bo''lmaydi.';
  end if;
  if v_o.payment_confirmed then
    raise exception using message = 'already_paid', hint = 'To''lov allaqachon tasdiqlangan.';
  end if;

  v_to := case when v_o.status = 'new' then 'paid' else v_o.status end;

  update public.orders o
     set payment_confirmed = true,
         payment_confirmed_at = now(),
         payment_confirmed_by = p_admin_id,
         status = v_to
   where o.id = p_order_id;

  insert into public.order_events (order_id, actor, actor_id, from_status, to_status, note)
  values (p_order_id, 'admin', p_admin_id, v_o.status, v_to,
          case when v_to = v_o.status then 'To''lov tasdiqlandi' end);

  return public.flect_admin_order(p_order_id);
end;
$$;

-- Holat o'tishlari:
--   new        -> processing | cancelled            (paid: faqat flect_admin_confirm_payment orqali)
--   paid       -> processing | completed | cancelled
--   processing -> completed  | cancelled
--   completed, cancelled — yakuniy.
-- completed faqat to'lov tasdiqlangan bo'lsa; cancelled uchun sabab (kamida 3 belgi) majburiy.
create or replace function public.flect_admin_set_status(
  p_order_id uuid, p_status text, p_note text, p_admin_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_o public.orders%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_ok boolean;
begin
  if p_status = 'paid' then
    raise exception using message = 'use_confirm_payment', hint = 'To''lovni "To''lovni tasdiqlash" tugmasi orqali tasdiqlang.';
  end if;
  if p_status is null or p_status not in ('processing', 'completed', 'cancelled') then
    raise exception using message = 'bad_status', hint = 'Holat noto''g''ri.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception using message = 'note_too_long', hint = 'Izoh 500 belgidan oshmasin.';
  end if;

  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception using message = 'order_not_found', hint = 'Buyurtma topilmadi.';
  end if;

  v_ok := case v_o.status
            when 'new'        then p_status in ('processing', 'cancelled')
            when 'paid'       then p_status in ('processing', 'completed', 'cancelled')
            when 'processing' then p_status in ('completed', 'cancelled')
            else false
          end;
  if not v_ok then
    raise exception using message = 'invalid_transition',
      hint = format('"%s" holatidan "%s" holatiga o''tkazib bo''lmaydi.',
                    public.flect_status_label(v_o.status), public.flect_status_label(p_status));
  end if;
  if p_status = 'completed' and not v_o.payment_confirmed then
    raise exception using message = 'payment_required', hint = 'Avval to''lovni tasdiqlang.';
  end if;
  if p_status = 'cancelled' and (v_note is null or char_length(v_note) < 3) then
    raise exception using message = 'reason_required', hint = 'Bekor qilish sababini yozing (kamida 3 belgi).';
  end if;

  update public.orders o
     set status = p_status,
         completed_at  = case when p_status = 'completed' then now() else null end,
         cancelled_at  = case when p_status = 'cancelled' then now() else null end,
         cancel_reason = case when p_status = 'cancelled' then v_note else o.cancel_reason end
   where o.id = p_order_id;

  insert into public.order_events (order_id, actor, actor_id, from_status, to_status, note)
  values (p_order_id, 'admin', p_admin_id, v_o.status, p_status, v_note);

  return public.flect_admin_order(p_order_id);
end;
$$;

create or replace function public.flect_admin_products_list(p_include_archived boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.category, p.sort_order, p.price_uzs, p.title), '[]'::jsonb)
    from public.products p
   where coalesce(p_include_archived, false) or p.archived_at is null;
$$;

create or replace function public.flect_admin_product_save(p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tags text[];
  v_price text := p_data ->> 'price_uzs';
  v_sort text := coalesce(p_data ->> 'sort_order', '0');
  v_row public.products%rowtype;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using message = 'bad_request', hint = 'Ma''lumot yuborilmadi.';
  end if;
  if jsonb_typeof(p_data -> 'price_uzs') is distinct from 'number' or v_price !~ '^[0-9]{1,10}$' then
    raise exception using message = 'invalid_product', hint = 'Narx musbat butun son bo''lishi kerak.';
  end if;
  if v_sort !~ '^-?[0-9]{1,6}$' then
    raise exception using message = 'invalid_product', hint = 'Tartib butun son bo''lishi kerak.';
  end if;
  if p_data ? 'tags' and jsonb_typeof(p_data -> 'tags') not in ('array', 'null') then
    raise exception using message = 'invalid_product', hint = 'Teglar ro''yxat bo''lishi kerak.';
  end if;

  select coalesce(array_agg(left(btrim(t), 32)) filter (where btrim(t) <> ''), '{}')
    into v_tags
    from jsonb_array_elements_text(coalesce(nullif(p_data -> 'tags', 'null'::jsonb), '[]'::jsonb)) t;

  begin
    if p_id is null then
      insert into public.products (slug, category, title, message_name, subtitle, price_uzs, price_is_from,
                                   is_active, is_popular, tags, image, sort_order)
      values (
        btrim(p_data ->> 'slug'),
        p_data ->> 'category',
        btrim(p_data ->> 'title'),
        coalesce(nullif(btrim(p_data ->> 'message_name'), ''), btrim(p_data ->> 'title')),
        nullif(btrim(p_data ->> 'subtitle'), ''),
        v_price::bigint,
        coalesce((p_data -> 'price_is_from') = 'true'::jsonb, false),
        coalesce((p_data -> 'is_active') = 'true'::jsonb, false),
        coalesce((p_data -> 'is_popular') = 'true'::jsonb, false),
        v_tags,
        nullif(btrim(p_data ->> 'image'), ''),
        v_sort::integer
      )
      returning * into v_row;
    else
      update public.products p
         set slug          = btrim(p_data ->> 'slug'),
             category      = p_data ->> 'category',
             title         = btrim(p_data ->> 'title'),
             message_name  = coalesce(nullif(btrim(p_data ->> 'message_name'), ''), btrim(p_data ->> 'title')),
             subtitle      = nullif(btrim(p_data ->> 'subtitle'), ''),
             price_uzs     = v_price::bigint,
             price_is_from = coalesce((p_data -> 'price_is_from') = 'true'::jsonb, false),
             is_active     = coalesce((p_data -> 'is_active') = 'true'::jsonb, false),
             is_popular    = coalesce((p_data -> 'is_popular') = 'true'::jsonb, false),
             tags          = v_tags,
             image         = nullif(btrim(p_data ->> 'image'), ''),
             sort_order    = v_sort::integer
       where p.id = p_id and p.archived_at is null
      returning * into v_row;
      if not found then
        raise exception using message = 'product_not_found', hint = 'Mahsulot topilmadi yoki arxivlangan.';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception using message = 'slug_taken', hint = 'Bu slug band. Boshqasini tanlang.';
    when not_null_violation or check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception using message = 'invalid_product',
        hint = 'Maydonlar noto''g''ri to''ldirilgan (toifa, slug, nom, narx yoki rasm).';
  end;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.flect_admin_product_archive(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.products%rowtype;
begin
  update public.products p
     set archived_at = now(), is_active = false
   where p.id = p_id and p.archived_at is null
  returning * into v_row;
  if not found then
    raise exception using message = 'product_not_found', hint = 'Mahsulot topilmadi yoki allaqachon arxivlangan.';
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Huquqlar: barcha flect_* funksiyalari faqat service_role uchun
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'flect\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
