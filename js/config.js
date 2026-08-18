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
  supabaseUrl: '',      // ej: 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: '',  // ej: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
