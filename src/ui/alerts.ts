// src/ui/alerts.ts
type ToastKind = 'info' | 'success' | 'warn' | 'error';
type DangerKind = 'default' | 'danger';

function ensureScaffold() {
  let toasts = document.getElementById('toasts');
  if (!toasts) {
    toasts = document.createElement('div');
    toasts.id = 'toasts';
    toasts.className = 'toasts';
    document.body.appendChild(toasts);
  }
  let modal = document.getElementById('modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-title" id="modalTitle"></div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-actions" id="modalActions"></div>
      </div>`;
    document.body.appendChild(modal);
  }
}

export function toast(message: string, kind: ToastKind = 'info', ms = 2200) {
  ensureScaffold();
  const host = document.getElementById('toasts')!;
  const div = document.createElement('div');
  div.className = `toast ${kind}`;
  div.textContent = message;
  host.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  const kill = () => {
    div.classList.remove('show');
    div.addEventListener('transitionend', () => div.remove(), { once: true });
  };
  setTimeout(kill, ms);
  div.onclick = kill;
}

function openModal(title: string, bodyHTML: string, actions: HTMLElement[]) {
  ensureScaffold();
  const modal = document.getElementById('modal')!;
  (document.getElementById('modalTitle')!).innerHTML = title;
  (document.getElementById('modalBody')!).innerHTML = bodyHTML;
  const act = document.getElementById('modalActions')!;
  act.innerHTML = '';
  actions.forEach((a) => act.appendChild(a));
  modal.classList.add('show');
}

function closeModal() {
  const modal = document.getElementById('modal')!;
  modal.classList.remove('show');
}

export async function confirmModal(
  title: string,
  messageHTML: string,
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  kind: DangerKind = 'default'
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const ok = document.createElement('button');
    ok.className = `btn ${kind === 'danger' ? 'btn-danger' : 'btn-primary'}`;
    ok.textContent = okLabel;
    ok.onclick = () => {
      closeModal();
      resolve(true);
    };
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = cancelLabel;
    cancel.onclick = () => {
      closeModal();
      resolve(false);
    };
    openModal(title, messageHTML, [cancel, ok]);
  });
}

export async function promptModal(
  title: string,
  messageHTML: string,
  placeholder = '',
  okLabel = 'OK',
  cancelLabel = 'Cancel'
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = placeholder;
    input.className = 'input';
    const body = `<div class="stack">${messageHTML}</div>`;
    const ok = document.createElement('button');
    ok.className = 'btn btn-primary';
    ok.textContent = okLabel;
    ok.onclick = () => {
      const v = input.value ?? '';
      closeModal();
      resolve(v);
    };
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = cancelLabel;
    cancel.onclick = () => {
      closeModal();
      resolve(null);
    };
    ensureScaffold();
    (document.getElementById('modalBody')!).innerHTML = '';
    openModal(title, '', [cancel, ok]);
    const bodyHost = document.getElementById('modalBody')!;
    bodyHost.innerHTML = body;
    bodyHost.appendChild(input);
    setTimeout(() => input.focus(), 30);
  });
}
