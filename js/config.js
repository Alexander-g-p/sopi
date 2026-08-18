/* ============================================================
   SOPI · config.js  —  CONEXIÓN CON SUPABASE
   ------------------------------------------------------------
   Pega aquí los dos datos de tu proyecto de Supabase:

     Supabase → tu proyecto → Settings (⚙) → API
       · Project URL      →  supabaseUrl
       · anon public key  →  supabaseAnonKey

   ¿Es seguro publicar la clave "anon"?  SÍ.
   Está pensada para ir en el navegador: por sí sola no da acceso
   a nada. Quien manda son las reglas RLS del archivo
   supabase/schema.sql, que hacen que cada usuario solo pueda leer
   y escribir SUS propias filas.
   NUNCA pongas aquí la clave "service_role": esa sí lo abre todo.

   Si dejas los valores vacíos, SOPI funciona igual pero guardando
   en este navegador (modo local), sin nube.
   ============================================================ */

window.SOPI_CONFIG = {
  supabaseUrl: 'https://ppxybyrulabskhqbozay.supabase.co',      // ej: 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBweHlieXJ1bGFic2tocWJvemF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMjE0NDAsImV4cCI6MjEwMjU5NzQ0MH0.fQ52zCGszj9CS0ONmv9z7MLAfMoMp6l01OiENiD-8Ps',  // ej: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
