import { PASSWORD_HINT } from './password-logic.js';

// Native modal supplies focus containment and background inertness, including touch.
export function createPasswordDialog(ctx, onAnswer) {
  const dialog = document.createElement('dialog'); dialog.className = 'password-dialog';
  dialog.setAttribute('aria-labelledby', 'password-question');
  dialog.setAttribute('aria-describedby', 'password-feedback');
  const form = document.createElement('form'); form.method = 'dialog';
  const title = document.createElement('h2'); title.id = 'password-question';
  const label = document.createElement('label'); label.htmlFor = 'password-answer'; label.textContent = 'Completa a frase';
  const input = document.createElement('input'); input.id = 'password-answer'; input.name = 'answer';
  input.type = 'text'; input.autocomplete = 'off'; input.maxLength = 48; input.enterKeyHint = 'done';
  input.setAttribute('autocapitalize', 'none'); input.spellcheck = false;
  const feedback = document.createElement('p'); feedback.id = 'password-feedback'; feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'password-actions';
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Responder';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Sair';
  actions.append(submit, cancel); form.append(title, label, input, feedback, actions); dialog.append(form); document.body.append(dialog);
  let current = null, previousFocus = null;
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    current = null; ctx.ui.setPasswordOverlay?.(false);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  });
  cancel.addEventListener('click', close);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!current) return;
    const result = onAnswer(current, input.value);
    if (result.accepted) close();
    else { if(result.phrase)title.textContent=result.phrase; feedback.textContent = result.hint || 'Experimenta outra vez.'; input.setAttribute('aria-invalid', 'true'); input.select(); }
  });
  // Do not let world hotkeys receive typing, Enter, Escape or touch actions.
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) dialog.addEventListener(type, event => event.stopPropagation());
  return {
    get open() { return dialog.open; },
    show(id, phrase, failures, wifiHint) {
      if (dialog.open) return false;
      current = id; previousFocus = document.activeElement;
      title.textContent = phrase; input.value = ''; input.removeAttribute('aria-invalid');
      feedback.textContent = wifiHint ? 'começa por b…' : failures >= 3 ? PASSWORD_HINT : '';
      ctx.ui.setPasswordOverlay?.(true);
      try { dialog.showModal(); input.focus({ preventScroll: true }); }
      catch { current = null; ctx.ui.setPasswordOverlay?.(false); return false; }
      return true;
    },
    close,
    dispose() { close(); dialog.remove(); },
  };
}
