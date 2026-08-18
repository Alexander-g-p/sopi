/* ============================================================
   SOPI · auth.js
   Pantalla de registro / inicio de sesión.

   Seguridad visible desde aquí:
     · medidor de fuerza de contraseña en el registro
     · botón para ver/ocultar la contraseña
     · aviso del bloqueo temporal tras varios intentos fallidos
     · mensajes que no revelan si un correo existe o no
   El cifrado (PBKDF2) y el bloqueo viven en store.js.
   ============================================================ */
(function () {
  'use strict';

  const { $, $$, el } = U;

  let lockTimer = null;

  function showTab(which) {
    $$('.auth-tab').forEach(b => b.classList.toggle('is-active', b.dataset.authTab === which));
    $('#form-login').classList.toggle('is-hidden', which !== 'login');
    $('#form-register').classList.toggle('is-hidden', which !== 'register');
    $$('.auth-error').forEach(e => (e.textContent = ''));
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = busy;
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = busy ? 'Un momento…' : btn.dataset.label;
  }

  /* ---------------- Ver / ocultar contraseña ---------------- */

  function addEye(input) {
    if (!input || input.parentElement.querySelector('.eye')) return;
    input.parentElement.classList.add('field--pass');
    const btn = el('button.eye', { type: 'button', title: 'Mostrar contraseña' },
      [Icons.svg('eye', { width: 1.7 })]);
    btn.addEventListener('click', () => {
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      btn.classList.toggle('is-on', ver);
      btn.title = ver ? 'Ocultar contraseña' : 'Mostrar contraseña';
      U.clear(btn).appendChild(Icons.svg(ver ? 'eyeOff' : 'eye', { width: 1.7 }));
      input.focus();
    });
    input.parentElement.appendChild(btn);
  }

  /* ---------------- Medidor de fuerza ---------------- */

  function buildMeter(form) {
    const pass = form.querySelector('input[name=password]');
    const meter = el('div.meter', null, [
      el('div.meter__bar', null, [el('i')]),
      el('span.meter__t', { text: 'Mínimo 8 caracteres, con letras y números' }),
    ]);
    pass.parentElement.insertAdjacentElement('afterend', meter);

    const bar = meter.querySelector('i');
    const txt = meter.querySelector('.meter__t');

    function update() {
      const fd = new FormData(form);
      const r = Store.passwordStrength(pass.value, [fd.get('name'), fd.get('email')]);
      const pct = pass.value ? Math.max(8, (r.score / 4) * 100) : 0;
      bar.style.width = pct + '%';
      meter.dataset.score = String(r.score);
      txt.textContent = !pass.value
        ? 'Mínimo 8 caracteres, con letras y números'
        : (r.problemas[0] || `Contraseña ${r.label.toLowerCase()}`);
      txt.classList.toggle('is-bad', !!r.problemas.length && pass.value.length > 0);
    }

    pass.addEventListener('input', update);
    form.querySelector('input[name=name]').addEventListener('input', update);
    update();
  }

  /* ---------------- Aviso de bloqueo ---------------- */

  function watchLock(form) {
    const emailInput = form.querySelector('input[name=email]');
    const err = form.querySelector('[data-error]');
    const btn = form.querySelector('button[type="submit"]');

    function tick() {
      const secs = Store.lockStatus(emailInput.value);
      if (secs > 0) {
        btn.disabled = true;
        err.textContent = secs > 60
          ? `Bloqueado por seguridad. Reintenta en ${Math.ceil(secs / 60)} min.`
          : `Bloqueado por seguridad. Reintenta en ${secs} s.`;
      } else if (btn.disabled && !btn.dataset.busy) {
        btn.disabled = false;
        if (/Bloqueado/.test(err.textContent)) err.textContent = '';
      }
    }

    emailInput.addEventListener('input', tick);
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = setInterval(tick, 1000);
    tick();
  }

  /* ---------------- Arranque ---------------- */

  function init() {
    $$('.auth-tab').forEach(b =>
      b.addEventListener('click', () => showTab(b.dataset.authTab)));

    const login = $('#form-login');
    const register = $('#form-register');

    addEye(login.querySelector('input[name=password]'));
    addEye(register.querySelector('input[name=password]'));
    buildMeter(register);
    if (window.SOPI_MODE !== 'supabase') watchLock(login);

    /* En modo nube: enlace de recuperación y textos propios */
    if (window.SOPI_MODE === 'supabase') {
      const foot = $('.auth-foot');
      if (foot) foot.textContent = 'Tus datos se guardan en la nube (Supabase) y los ves desde cualquier dispositivo.';

      const forgot = $('#btn-forgot');
      if (forgot) {
        forgot.classList.remove('is-hidden');
        forgot.addEventListener('click', async () => {
          const email = await UI.prompt({
            title: 'Recuperar contraseña',
            label: 'Tu correo',
            value: login.querySelector('input[name=email]').value,
            placeholder: 'tu@correo.com',
            confirmText: 'Enviar enlace',
          });
          if (!email) return;
          try {
            await Store.resetPassword(email);
            await UI.alert({
              title: 'Revisa tu correo',
              message: 'Si esa cuenta existe, te llegó un enlace para crear una contraseña nueva. Mira también la carpeta de spam.',
              icon: 'note',
            });
          } catch (e) { U.toast(e.message, 'error'); }
        });
      }
    }

    // Al corregir cualquier campo, el error anterior desaparece
    [login, register].forEach(form => {
      const err = form.querySelector('[data-error]');
      form.querySelectorAll('input').forEach(i => i.addEventListener('input', () => {
        if (err.textContent && !/Bloqueado/.test(err.textContent)) err.textContent = '';
      }));
    });

    login.addEventListener('submit', async ev => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const err  = form.querySelector('[data-error]');
      err.textContent = '';
      setBusy(form, true);
      try {
        const fd = new FormData(form);
        const user = await Store.login({
          email: fd.get('email'),
          password: fd.get('password'),
        });
        form.querySelector('input[name=password]').value = '';
        App.onAuthenticated(user);
      } catch (e) {
        err.textContent = e.message;
        form.querySelector('input[name=password]').select();
      } finally {
        setBusy(form, false);
      }
    });

    register.addEventListener('submit', async ev => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const err  = form.querySelector('[data-error]');
      err.textContent = '';
      setBusy(form, true);
      try {
        const fd = new FormData(form);
        const user = await Store.register({
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
        });
        form.reset();
        App.onAuthenticated(user);
      } catch (e) {
        if (e.needsConfirmation) {
          form.reset();
          showTab('login');
          await UI.alert({
            title: 'Cuenta creada',
            message: e.message,
            icon: 'note',
          });
        } else {
          err.textContent = e.message;
        }
      } finally {
        setBusy(form, false);
      }
    });
  }

  window.Auth = { init, showTab };
})();
