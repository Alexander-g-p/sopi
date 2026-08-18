-- ============================================================================
-- SOPI · Esquema completo para Supabase
-- ----------------------------------------------------------------------------
-- CÓMO USARLO
--   1. Entra a tu proyecto en supabase.com
--   2. Menú lateral → SQL Editor → New query
--   3. Pega TODO este archivo y pulsa "Run"
--   4. Listo: tablas, seguridad y automatismos quedan creados
--
-- Se puede volver a ejecutar sin miedo: todo usa IF NOT EXISTS / OR REPLACE.
--
-- QUÉ CREA
--   · 8 tablas (perfil, listas, tareas, hábitos, registros, pomodoros,
--     cuentas atrás y ajustes)
--   · Seguridad a nivel de fila (RLS): cada usuario SOLO ve lo suyo
--   · Un disparador que, al registrarse alguien, le crea su perfil,
--     sus 4 listas iniciales y sus ajustes
--   · Índices para que las consultas por fecha vayan rápidas
-- ============================================================================


-- ============================================================================
-- 1. PERFIL DEL USUARIO
--    auth.users lo maneja Supabase; aquí guardamos solo el nombre visible.
-- ============================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Usuario',
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Nombre visible de cada usuario de SOPI';


-- ============================================================================
-- 2. LISTAS  (Bandeja de entrada, Trabajo, Estudio, Personal…)
-- ============================================================================

create table if not exists public.lists (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#4772fa',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists lists_user_idx on public.lists (user_id, position);


-- ============================================================================
-- 3. TAREAS
--    kind: 'normal' | 'weekly' (se repite cada semana) | 'instant' (una vez)
--    repeat_days: días de la semana de las semanales (0=domingo … 6=sábado)
--    done_dates : días ya marcados de una tarea semanal
-- ============================================================================

create table if not exists public.tasks (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  list_id      text references public.lists(id) on delete set null,

  title        text not null,
  kind         text not null default 'normal'
               check (kind in ('normal', 'weekly', 'instant')),
  note         text not null default '',

  due_date     date,
  due_time     text,                       -- 'HH:MM'
  priority     smallint not null default 0 check (priority between 0 and 3),

  repeat_days  smallint[] not null default '{}',
  done_dates   text[]     not null default '{}',

  urgent       boolean,                    -- Matriz de Eisenhower
  important    boolean,

  pomodoros    integer not null default 0, -- Cronómetro
  estimate     integer not null default 0,
  duration     integer not null default 60,-- minutos que ocupa en el calendario

  subtasks     jsonb   not null default '[]'::jsonb,

  completed    boolean not null default false,
  completed_at timestamptz,
  trashed      boolean not null default false,

  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_user_idx      on public.tasks (user_id);
create index if not exists tasks_due_idx       on public.tasks (user_id, due_date)
       where trashed = false;
create index if not exists tasks_list_idx      on public.tasks (user_id, list_id)
       where trashed = false;
create index if not exists tasks_weekly_idx    on public.tasks (user_id, kind)
       where kind = 'weekly' and trashed = false;


-- ============================================================================
-- 4. HÁBITOS  +  5. REGISTROS DE HÁBITOS
--    freq: {"type":"daily|days|weekly","days":[1,3],"times":3}
--    Un registro existente = ese día está hecho.
-- ============================================================================

create table if not exists public.habits (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '✅',
  color       text not null default '#4772fa',
  freq        jsonb not null default '{"type":"daily","days":[1,2,3,4,5],"times":3}'::jsonb,
  archived    boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists habits_user_idx on public.habits (user_id, position);

create table if not exists public.habit_logs (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    text not null references public.habits(id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (habit_id, date)                  -- un hábito no se marca dos veces el mismo día
);

create index if not exists habit_logs_user_idx on public.habit_logs (user_id, date);


-- ============================================================================
-- 6. SESIONES DEL CRONÓMETRO (POMODORO)
-- ============================================================================

create table if not exists public.pomodoro_sessions (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     text references public.tasks(id) on delete set null,
  kind        text not null default 'focus'
              check (kind in ('focus', 'short', 'long')),
  minutes     integer not null default 0,
  date        date not null default current_date,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz not null default now()
);

create index if not exists pomodoros_user_idx on public.pomodoro_sessions (user_id, date);


-- ============================================================================
-- 7. CUENTAS ATRÁS
-- ============================================================================

create table if not exists public.countdowns (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  emoji       text not null default '📅',
  color       text not null default '#4772fa',
  date        date not null,
  time        text,                        -- 'HH:MM'
  repeat      text not null default 'none'
              check (repeat in ('none', 'yearly', 'monthly')),
  note        text not null default '',
  task_id     text references public.tasks(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists countdowns_user_idx on public.countdowns (user_id, date);


-- ============================================================================
-- 8. AJUSTES  (duraciones del pomodoro, inicio de semana, etc.)
-- ============================================================================

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{
                 "pomodoro": {"focus":25,"shortBreak":5,"longBreak":15,"cycles":4},
                 "startOfWeek": 1
               }'::jsonb,
  updated_at  timestamptz not null default now()
);


-- ============================================================================
-- SEGURIDAD (RLS)
-- ----------------------------------------------------------------------------
-- Sin esto, cualquiera con la clave pública podría leer datos ajenos.
-- Con esto, Postgres filtra por usuario en CADA consulta, aunque el
-- navegador pida otra cosa.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.lists             enable row level security;
alter table public.tasks             enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_logs        enable row level security;
alter table public.pomodoro_sessions enable row level security;
alter table public.countdowns        enable row level security;
alter table public.user_settings     enable row level security;

-- Perfil: cada quien el suyo
drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Ajustes: cada quien los suyos
drop policy if exists "ajustes propios" on public.user_settings;
create policy "ajustes propios" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- El resto de tablas siguen el mismo patrón: user_id = usuario conectado
do $$
declare t text;
begin
  foreach t in array array['lists','tasks','habits','habit_logs','pomodoro_sessions','countdowns']
  loop
    execute format('drop policy if exists "datos propios" on public.%I', t);
    execute format(
      'create policy "datos propios" on public.%I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;


-- ============================================================================
-- PERMISOS DE TABLA
-- ----------------------------------------------------------------------------
-- RLS decide QUÉ FILAS ve cada usuario, pero antes Postgres exige permiso
-- para tocar la tabla. En algunos proyectos los privilegios por defecto no
-- se aplican solos y aparece "permission denied for table ...".
-- Esto lo deja resuelto (es el mismo esquema que usa Supabase por defecto).
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;


-- ============================================================================
-- AUTOMATISMOS
-- ============================================================================

-- updated_at de las tareas se actualiza solo
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();


-- Al registrarse un usuario: perfil + ajustes + 4 listas iniciales
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := 'lst_' || replace(new.id::text, '-', '');
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.lists (id, user_id, name, color, position) values
    (base || '_0', new.id, 'Bandeja de entrada', '#4772fa', 0),
    (base || '_1', new.id, 'Trabajo',            '#e64545', 1),
    (base || '_2', new.id, 'Estudio',            '#f0a92a', 2),
    (base || '_3', new.id, 'Personal',           '#35b98a', 3)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Recargar la caché del API para que todo lo anterior surta efecto ya
notify pgrst, 'reload schema';


-- ============================================================================
-- COMPROBACIÓN FINAL
-- Al terminar deberías ver 8 filas, todas con rls_activo = true
-- ============================================================================

select tablename as tabla, rowsecurity as rls_activo
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','lists','tasks','habits','habit_logs',
                    'pomodoro_sessions','countdowns','user_settings')
order by tablename;
