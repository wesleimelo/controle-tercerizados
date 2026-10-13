-- =====================================================================
-- Rotas do CD: banco de dados (Supabase / Postgres)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- =====================================================================

-- ---------- tabelas ----------

-- Um perfil por pessoa que acessa o sistema.
-- role = 'driver' (motorista) ou 'coord' (coordenação).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  full_name text not null check (length(full_name) between 2 and 60),
  role text not null default 'driver' check (role in ('driver', 'coord')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (plate ~ '^[A-Z0-9]{3,7}$'),
  name text not null check (length(name) between 1 and 30),
  active boolean not null default true
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid not null references public.profiles(id),
  driver_name text not null,
  plate text not null,
  vehicle_name text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  start_km integer not null check (start_km between 0 and 9999999),
  start_at timestamptz not null default now(),
  start_photo text not null,
  end_km integer check (end_km between 0 and 9999999),
  end_at timestamptz,
  end_photo text,
  notes text check (length(notes) <= 200),
  km_driven integer generated always as (end_km - start_km) stored,
  check (
    (status = 'open' and end_km is null)
    or (status = 'closed' and end_km is not null and end_km >= start_km)
  )
);

-- No máximo uma rota aberta por veículo.
create unique index routes_one_open_per_vehicle on public.routes (vehicle_id) where status = 'open';
create index routes_start_at_idx on public.routes (start_at desc);
create index routes_driver_idx on public.routes (driver_id);

-- ---------- funções de apoio ----------

create or replace function public.is_coord()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'coord' and p.active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
  );
$$;

-- ---------- regras de acesso (RLS) ----------

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.routes enable row level security;

-- Cada pessoa lê o próprio perfil; a coordenação lê todos.
-- Ninguém altera perfis direto: a criação e a edição passam pela função manage-users.
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_coord());

-- Veículos: todo usuário ativo lê; só a coordenação altera.
create policy vehicles_read on public.vehicles
  for select to authenticated
  using (public.is_active_user());
create policy vehicles_coord_insert on public.vehicles
  for insert to authenticated
  with check (public.is_coord());
create policy vehicles_coord_update on public.vehicles
  for update to authenticated
  using (public.is_coord()) with check (public.is_coord());
create policy vehicles_coord_delete on public.vehicles
  for delete to authenticated
  using (public.is_coord());

-- Rotas: o motorista lê só as próprias; a coordenação lê todas e pode corrigir ou excluir.
-- Ninguém cria rota direto: o motorista usa as funções start_route e finish_route.
create policy routes_read on public.routes
  for select to authenticated
  using (driver_id = auth.uid() or public.is_coord());
create policy routes_coord_update on public.routes
  for update to authenticated
  using (public.is_coord()) with check (public.is_coord());
create policy routes_coord_delete on public.routes
  for delete to authenticated
  using (public.is_coord());

-- ---------- funções que o motorista usa ----------

-- Quadro de veículos: situação de cada veículo ativo (livre ou em rota) e último km registrado.
create or replace function public.vehicle_board()
returns table (
  id uuid,
  plate text,
  name text,
  route_id uuid,
  driver_id uuid,
  driver_name text,
  start_km integer,
  start_at timestamptz,
  start_photo text,
  last_km integer
)
language sql stable security definer set search_path = public
as $$
  select
    v.id, v.plate, v.name,
    r.id, r.driver_id, r.driver_name, r.start_km, r.start_at, r.start_photo,
    (select c.end_km from public.routes c
      where c.vehicle_id = v.id and c.status = 'closed'
      order by c.end_at desc limit 1)
  from public.vehicles v
  left join public.routes r on r.vehicle_id = v.id and r.status = 'open'
  where v.active and public.is_active_user()
  order by v.name, v.plate;
$$;

-- Inicia uma rota. A hora é a do servidor, não a do celular.
create or replace function public.start_route(p_vehicle uuid, p_km integer, p_photo text)
returns public.routes
language plpgsql security definer set search_path = public
as $$
declare
  p public.profiles;
  v public.vehicles;
  r public.routes;
begin
  select * into p from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'Usuário sem acesso'; end if;

  select * into v from public.vehicles where id = p_vehicle and active;
  if not found then raise exception 'Veículo não encontrado'; end if;

  if p_km is null or p_km < 0 or p_km > 9999999 then raise exception 'Km inválido'; end if;
  if p_photo is null or p_photo not like auth.uid()::text || '/%' then raise exception 'Foto inválida'; end if;

  insert into public.routes (vehicle_id, driver_id, driver_name, plate, vehicle_name, start_km, start_photo)
  values (v.id, p.id, p.full_name, v.plate, v.name, p_km, p_photo)
  returning * into r;
  return r;
exception
  when unique_violation then
    raise exception 'Este veículo já está em rota';
end;
$$;

-- Finaliza uma rota aberta.
create or replace function public.finish_route(p_route uuid, p_km integer, p_photo text, p_notes text)
returns public.routes
language plpgsql security definer set search_path = public
as $$
declare
  r public.routes;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;

  select * into r from public.routes where id = p_route and status = 'open' for update;
  if not found then raise exception 'Rota não encontrada ou já finalizada'; end if;

  -- Só quem iniciou a rota (ou a coordenação) pode finalizá-la.
  if r.driver_id <> auth.uid() and not public.is_coord() then
    raise exception 'Esta rota é de outro motorista. Só ele ou a coordenação pode finalizar';
  end if;

  if p_km is null or p_km > 9999999 then raise exception 'Km inválido'; end if;
  if p_km < r.start_km then raise exception 'O km final não pode ser menor que o inicial'; end if;
  if p_photo is null or p_photo not like auth.uid()::text || '/%' then raise exception 'Foto inválida'; end if;

  update public.routes
     set status = 'closed',
         end_km = p_km,
         end_at = now(),
         end_photo = p_photo,
         notes = nullif(left(trim(coalesce(p_notes, '')), 200), '')
   where id = p_route
   returning * into r;
  return r;
end;
$$;

-- Cancela uma rota aberta (início com km errado). Só quem iniciou ou a coordenação.
create or replace function public.cancel_route(p_route uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.routes;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;

  select * into r from public.routes where id = p_route and status = 'open' for update;
  if not found then raise exception 'Rota não encontrada ou já finalizada'; end if;
  if r.driver_id <> auth.uid() and not public.is_coord() then
    raise exception 'Você não pode cancelar esta rota';
  end if;

  delete from public.routes where id = p_route;
end;
$$;

-- Só usuários logados chamam estas funções.
revoke all on function public.is_coord() from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.vehicle_board() from public, anon;
revoke all on function public.start_route(uuid, integer, text) from public, anon;
revoke all on function public.finish_route(uuid, integer, text, text) from public, anon;
revoke all on function public.cancel_route(uuid) from public, anon;
grant execute on function public.is_coord() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.vehicle_board() to authenticated;
grant execute on function public.start_route(uuid, integer, text) to authenticated;
grant execute on function public.finish_route(uuid, integer, text, text) to authenticated;
grant execute on function public.cancel_route(uuid) to authenticated;

-- ---------- fotos do odômetro (Storage) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('odometer-photos', 'odometer-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- O motorista envia fotos só para a própria pasta (nome da pasta = id dele).
create policy "fotos: enviar na propria pasta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'odometer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );

-- Cada um vê as próprias fotos; a coordenação vê todas.
create policy "fotos: ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'odometer-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coord())
  );

-- O motorista só apaga foto que ainda não pertence a nenhuma rota (limpeza de envio que falhou).
create policy "fotos: apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'odometer-photos'
    and (
      public.is_coord()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (
          select 1 from public.routes r
          where r.start_photo = storage.objects.name or r.end_photo = storage.objects.name
        )
      )
    )
  );

-- ---------- veículos iniciais ----------
-- As placas abaixo estão incompletas (só as 3 letras). Complete e renomeie na área da coordenação.
insert into public.vehicles (plate, name) values
  ('SEY', 'Veículo SEY'),
  ('UBG', 'Veículo UBG'),
  ('UCI', 'Veículo UCI');
