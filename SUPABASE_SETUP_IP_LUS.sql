-- Igreja Pentecostal LUS
-- Base compartilhada do Painel de Cultos
-- Execute este arquivo UMA VEZ no SQL Editor do Supabase.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.cultos (
  id text primary key,
  data date,
  tipo text not null,
  pessoas integer check (pessoas is null or pessoas >= 0),
  visitantes integer check (visitantes is null or visitantes >= 0),
  pastores integer check (pastores is null or pastores >= 0),
  valor numeric(12,2) check (valor is null or valor >= 0),
  meio text,
  abriu text,
  pregador text,
  visualizacoes integer check (visualizacoes is null or visualizacoes >= 0),
  obs text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.cultos alter column data drop not null;

create index if not exists cultos_data_idx on public.cultos(data);
create index if not exists cultos_tipo_idx on public.cultos(tipo);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cultos_updated_at on public.cultos;
create trigger trg_cultos_updated_at
before update on public.cultos
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Cria perfil para usuários que já existiam antes deste script.
insert into public.profiles(id, display_name, role)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1)), 'viewer'
from auth.users
on conflict (id) do nothing;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer');
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.cultos enable row level security;

-- Policies: perfis
DROP POLICY IF EXISTS "profiles_read_self" ON public.profiles;
CREATE POLICY "profiles_read_self"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Policies: cultos
DROP POLICY IF EXISTS "cultos_read_authenticated" ON public.cultos;
CREATE POLICY "cultos_read_authenticated"
ON public.cultos
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "cultos_insert_editors" ON public.cultos;
CREATE POLICY "cultos_insert_editors"
ON public.cultos
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin','editor'));

DROP POLICY IF EXISTS "cultos_update_editors" ON public.cultos;
CREATE POLICY "cultos_update_editors"
ON public.cultos
FOR UPDATE
TO authenticated
USING (public.current_app_role() IN ('admin','editor'))
WITH CHECK (public.current_app_role() IN ('admin','editor'));

DROP POLICY IF EXISTS "cultos_delete_editors" ON public.cultos;
CREATE POLICY "cultos_delete_editors"
ON public.cultos
FOR DELETE
TO authenticated
USING (public.current_app_role() IN ('admin','editor'));

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.cultos to authenticated;

-- Ativa atualizações em tempo real do painel.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cultos'
  ) then
    alter publication supabase_realtime add table public.cultos;
  end if;
end $$;

commit;

-- =============================================================
-- DEPOIS DE CRIAR AS CONTAS EM Authentication > Users,
-- use os comandos abaixo para definir os perfis.
-- Troque os e-mails pelos e-mails reais da liderança.
-- =============================================================

-- Administrador principal:
-- update public.profiles p
-- set role = 'admin', display_name = 'Administrador'
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('admin@exemplo.com');

-- Pessoa que pode preencher/corrigir o formulário:
-- update public.profiles p
-- set role = 'editor', display_name = 'Secretaria'
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('secretaria@exemplo.com');

-- Liderança somente para acompanhamento:
-- update public.profiles p
-- set role = 'viewer', display_name = 'Liderança'
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('lider@exemplo.com');

-- Conferência dos perfis cadastrados:
-- select u.email, p.display_name, p.role
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- order by u.email;
