/* ============================================================
   SOPI · ui.js
   Diálogos propios de la app (nada de window.confirm/prompt/alert):
   mismo diseño, textos en español y foco accesible.

     await UI.confirm({ title, message, confirmText, danger })  -> bool
     await UI.prompt({ title, label, value, placeholder })      -> string|null
     await UI.alert({ title, message })                         -> true
   ============================================================ */
(function () {
  'use strict';

  const { el, $, clear } = U;

  let openCount = 0;

  /** Crea el armazón del diálogo y devuelve { overlay, card, close }. */
  function shell(opts) {
    const overlay = el('div.dlg-overlay', { role: 'presentation' });
    const card = el('div.dlg' + (opts.danger ? '.dlg--danger' : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Aviso',
    });
    overlay.appendChild(card);

    if (opts.icon) {
      card.appendChild(el('div.dlg__icon', null, [Icons.svg(opts.icon, { width: 1.8 })]));
    }
    if (opts.title)   card.appendChild(el('h2.dlg__title', { text: opts.title }));
    if (opts.message) card.appendChild(el('p.dlg__msg', { text: opts.message }));

    const prevFocus = document.activeElement;
    openCount++;
    document.body.classList.add('has-dlg');

    function close(result, resolve) {
      overlay.classList.add('is-out');
      setTimeout(() => {
        overlay.remove();
        if (--openCount <= 0) document.body.classList.remove('has-dlg');
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
        resolve(result);
      }, 120);
    }

    return { overlay, card, close };
  }

  function mount(overlay) {
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-in'));
  }

  /* ---------------- Confirmar ---------------- */

  function confirm(opts) {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise(resolve => {
      const { overlay, card, close } = shell({
        title: o.title || '¿Confirmas?',
        message: o.message || '',
        danger: o.danger !== false,
        icon: o.icon || (o.danger === false ? 'note' : 'trash'),
      });

      const cancel = el('button.btn.btn--outline', {
        text: o.cancelText || 'Cancelar',
        onclick: () => close(false, resolve),
      });
      const ok = el('button.btn' + (o.danger === false ? '.btn--primary' : '.btn--danger'), {
        text: o.confirmText || 'Eliminar',
        onclick: () => close(true, resolve),
      });

      card.appendChild(el('div.dlg__actions', null, [cancel, ok]));

      overlay.addEventListener('click', ev => { if (ev.target === overlay) close(false, resolve); });
      overlay.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') close(false, resolve);
        if (ev.key === 'Enter')  close(true, resolve);
      });

      mount(overlay);
      setTimeout(() => ok.focus(), 60);
    });
  }

  /* ---------------- Pedir un texto ---------------- */

  function prompt(opts) {
    const o = typeof opts === 'string' ? { title: opts } : (opts || {});
    return new Promise(resolve => {
      const { overlay, card, close } = shell({
        title: o.title || 'Escribe un nombre',
        message: o.message || '',
        icon: o.icon || 'edit',
      });

      const input = el('input.dlg__input', {
        type: 'text',
        value: o.value || '',
        placeholder: o.placeholder || '',
        maxlength: o.maxlength || 60,
      });
      const error = el('p.dlg__error');

      card.appendChild(el('label.dlg__field', null, [
        o.label ? el('span', { text: o.label }) : null,
        input,
      ]));
      card.appendChild(error);

      function accept() {
        const v = input.value.trim();
        if (!v) { error.textContent = 'Escribe algo para continuar.'; input.focus(); return; }
        close(v, resolve);
      }

      card.appendChild(el('div.dlg__actions', null, [
        el('button.btn.btn--outline', { text: o.cancelText || 'Cancelar', onclick: () => close(null, resolve) }),
        el('button.btn.btn--primary', { text: o.confirmText || 'Guardar', onclick: accept }),
      ]));

      overlay.addEventListener('click', ev => { if (ev.target === overlay) close(null, resolve); });
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); accept(); }
        if (ev.key === 'Escape') close(null, resolve);
      });

      mount(overlay);
      setTimeout(() => { input.focus(); input.select(); }, 60);
    });
  }

  /* ---------------- Avisar ---------------- */

  function alert(opts) {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise(resolve => {
      const { overlay, card, close } = shell({
        title: o.title || 'Aviso',
        message: o.message || '',
        icon: o.icon || 'note',
      });
      const ok = el('button.btn.btn--primary', {
        text: o.confirmText || 'Entendido',
        onclick: () => close(true, resolve),
      });
      card.appendChild(el('div.dlg__actions', null, [ok]));
      overlay.addEventListener('keydown', ev => {
        if (ev.key === 'Escape' || ev.key === 'Enter') close(true, resolve);
      });
      mount(overlay);
      setTimeout(() => ok.focus(), 60);
    });
  }

  window.UI = { confirm, prompt, alert };
})();
