-- FLECT STARS — boshlang'ich katalog.
-- Narxlar loyihaning avvalgi data.js faylidan olingan (commit 49d8ec0).
-- Takroran ishga tushirilsa ham xavfsiz: slug bo'yicha mavjud (jumladan arxivlangan)
-- mahsulot qayta qo'shilmaydi va mavjud narx/ma'lumotlar o'zgartirilmaydi.
-- NFT bo'limi ataylab bo'sh ("Tez orada").

insert into public.products (slug, category, title, message_name, subtitle, price_uzs, price_is_from, image, sort_order)
select v.slug, v.category, v.title, v.message_name, v.subtitle, v.price_uzs, v.price_is_from, v.image, v.sort_order
from (values
  ('stars-50', 'stars', '50 Stars', '50 Stars', null, 12000, false, null, 0),
  ('stars-75', 'stars', '75 Stars', '75 Stars', null, 17000, false, null, 10),
  ('stars-100', 'stars', '100 Stars', '100 Stars', null, 23000, false, null, 20),
  ('stars-150', 'stars', '150 Stars', '150 Stars', null, 34000, false, null, 30),
  ('stars-200', 'stars', '200 Stars', '200 Stars', null, 45000, false, null, 40),
  ('stars-300', 'stars', '300 Stars', '300 Stars', null, 66000, false, null, 50),
  ('stars-500', 'stars', '500 Stars', '500 Stars', null, 108000, false, null, 60),
  ('stars-1000', 'stars', '1000 Stars', '1000 Stars', null, 210000, false, null, 70),
  ('stars-2500', 'stars', '2500 Stars', '2500 Stars', null, 510000, false, null, 80),
  ('stars-5000', 'stars', '5000 Stars', '5000 Stars', null, 990000, false, null, 90),
  ('stars-10000', 'stars', '10000 Stars', '10000 Stars', null, 1900000, false, null, 100),
  ('premium-1m', 'premium', '1 oy', '1 oylik Telegram Premium', '1 oylik Telegram Premium obunasi.', 45000, false, null, 0),
  ('premium-3m', 'premium', '3 oy', '3 oylik Telegram Premium', '3 oylik Telegram Premium obunasi.', 179000, false, null, 10),
  ('premium-6m', 'premium', '6 oy', '6 oylik Telegram Premium', '6 oylik Telegram Premium obunasi.', 239000, false, null, 20),
  ('premium-12m-account', 'premium', '12 oy — Akkaunt orqali', '12 oylik, akkaunt orqali Telegram Premium', 'Faollashtirish akkaunt usuli orqali amalga oshiriladi.', 299000, false, null, 30),
  ('premium-12m-gift', 'premium', '12 oy — Gift sifatida', '12 oylik, gift sifatida Telegram Premium', 'Premium sovg‘a (gift) sifatida yetkaziladi.', 399000, false, null, 40),
  ('gift-heart', 'gifts', 'Yurak', 'Yurak (15 ⭐) sovg‘asi', '15 Stars', 4000, false, 'img/gifts/heart.webp', 0),
  ('gift-bear', 'gifts', 'Ayiqcha', 'Ayiqcha (15 ⭐) sovg‘asi', '15 Stars', 4000, false, 'img/gifts/bear.webp', 10),
  ('gift-box', 'gifts', 'Sovg‘a qutisi', 'Sovg‘a qutisi (25 ⭐) sovg‘asi', '25 Stars', 6000, false, 'img/gifts/box.webp', 20),
  ('gift-rose', 'gifts', 'Atirgul', 'Atirgul (25 ⭐) sovg‘asi', '25 Stars', 6000, false, 'img/gifts/rose.webp', 30),
  ('gift-cake', 'gifts', 'Tort', 'Tort (50 ⭐) sovg‘asi', '50 Stars', 11000, false, 'img/gifts/cake.webp', 40),
  ('gift-bouquet', 'gifts', 'Gulchambar', 'Gulchambar (50 ⭐) sovg‘asi', '50 Stars', 11000, false, 'img/gifts/bouquet.webp', 50),
  ('gift-rocket', 'gifts', 'Raketa', 'Raketa (50 ⭐) sovg‘asi', '50 Stars', 11000, false, 'img/gifts/rocket.webp', 60),
  ('gift-champagne', 'gifts', 'Shampan', 'Shampan (50 ⭐) sovg‘asi', '50 Stars', 11000, false, 'img/gifts/champagne.webp', 70),
  ('gift-cup', 'gifts', 'Kubok', 'Kubok (100 ⭐) sovg‘asi', '100 Stars', 21000, false, 'img/gifts/trophy.webp', 80),
  ('gift-ring', 'gifts', 'Uzuk', 'Uzuk (100 ⭐) sovg‘asi', '100 Stars', 21000, false, 'img/gifts/ring.webp', 90),
  ('gift-diamond', 'gifts', 'Olmos', 'Olmos (100 ⭐) sovg‘asi', '100 Stars', 21000, false, 'img/gifts/diamond.webp', 100),
  ('accounts-uz', 'accounts', 'O‘zbekiston raqamli akkaunt', 'O‘zbekiston raqamli Telegram akkaunti', 'Aniq narx va mavjudlikni admin tasdiqlaydi', 14000, true, null, 0)
) as v(slug, category, title, message_name, subtitle, price_uzs, price_is_from, image, sort_order)
where not exists (select 1 from public.products p where p.slug = v.slug);
