-- Testimoni penghuni: ditulis penghuni sendiri lewat Portal Penghuni (menu Testimoni),
-- langsung tampil di section "Testimoni Penghuni Kost" di landing page.
-- Admin bisa menyembunyikan / menghapus testimoni lewat Admin → Testimoni.

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade, -- 1 testimoni per penghuni (bisa diedit)
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  rating smallint not null check (rating between 1 and 5),
  message text not null check (char_length(btrim(message)) between 10 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index testimonials_visible_idx on public.testimonials (is_hidden, updated_at desc);

create trigger trg_testimonials_updated_at before update on public.testimonials
  for each row execute function public.set_updated_at();

-- Penghuni nggak boleh mengubah status tampil/sembunyi sendiri (cuma admin).
create or replace function public.testimonials_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_hidden := false;
    else
      new.is_hidden := old.is_hidden;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_testimonials_guard before insert or update on public.testimonials
  for each row execute function public.testimonials_guard();

alter table public.testimonials enable row level security;

-- Penghuni aktif: kelola testimoni miliknya sendiri. Admin: lihat & kelola semua.
create policy "testimonials_select_own_or_admin" on public.testimonials
  for select using (user_id = auth.uid() or public.is_admin());
create policy "testimonials_insert_own_active_tenant" on public.testimonials
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'penghuni' and p.is_active)
  );
create policy "testimonials_update_own_or_admin" on public.testimonials
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "testimonials_delete_own_or_admin" on public.testimonials
  for delete using (user_id = auth.uid() or public.is_admin());

-- Tampilan publik untuk landing page: cuma kolom yang aman ditampilkan
-- (tanpa user_id / data akun), dan cuma yang tidak disembunyikan admin.
create view public.public_testimonials as
  select id, display_name, rating, message, updated_at
  from public.testimonials
  where is_hidden = false
  order by updated_at desc;

grant select on public.public_testimonials to anon, authenticated;
