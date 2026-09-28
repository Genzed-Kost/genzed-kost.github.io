-- ============================================================
-- Prioritas 3: bayar di muka dengan diskon bertingkat. Penghuni siklus
-- BULANAN bisa sekalian bayar beberapa bulan ke depan (3/6/12, dst —
-- admin yang atur jenjangnya) dan dapat diskon.
-- ============================================================

insert into public.settings (key, value) values
(
  'advance_payment_discounts',
  '[
    {"months": 3, "discount_percent": 2},
    {"months": 6, "discount_percent": 5},
    {"months": 12, "discount_percent": 10}
  ]'::jsonb
)
on conflict (key) do nothing;
