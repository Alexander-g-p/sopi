-- ============================================================================
-- SOPI · Arreglo: "permission denied for table ..."
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo completo en:
--     Supabase → SQL Editor → New query → pegar → Run
--
-- QUÉ HACE
--   Da a los roles del API (anon y authenticated) permiso para usar las
--   tablas del esquema public. Sin esto, Postgres rechaza cualquier
--   consulta antes incluso de mirar las reglas de seguridad.
--
-- ¿ES SEGURO?
--   Sí. El permiso de tabla solo abre la puerta; quien decide QUÉ FILAS
--   ve cada usuario siguen siendo las políticas RLS del schema.sql
--   (auth.uid() = user_id). Este es exactamente el mismo esquema de
--   permisos que Supabase aplica por defecto a las tablas nuevas.
-- ============================================================================

-- 1. Poder "entrar" al esquema
grant usage on schema public to anon, authenticated, service_role;

-- 2. Permisos sobre las tablas que ya existen
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- 3. Secuencias (por si alguna tabla usa contadores)
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- 4. Que las tablas FUTURAS nazcan con los mismos permisos
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- 5. Recargar la caché del API para que el cambio surta efecto de inmediato
notify pgrst, 'reload schema';


-- ============================================================================
-- COMPROBACIÓN
-- Deben aparecer las 8 tablas, cada una con anon y authenticated,
-- y con los cuatro permisos: DELETE, INSERT, SELECT, UPDATE
-- ============================================================================

select
  table_name as tabla,
  grantee    as rol,
  string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('profiles','lists','tasks','habits','habit_logs',
                     'pomodoro_sessions','countdowns','user_settings')
group by table_name, grantee
order by table_name, grantee;
