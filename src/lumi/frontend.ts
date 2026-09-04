import type { SpindleFrontendContextLite } from './spindle-lite.js';

export function setup(ctx: SpindleFrontendContextLite) {
  const removeStyle = ctx.dom.addStyle(`
    .ffmvu-bridge { padding: 14px; display: grid; gap: 12px; color: var(--lumiverse-text); }
    .ffmvu-card { padding: 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); }
    .ffmvu-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .ffmvu-title { font-weight: 700; }
    .ffmvu-muted { color: var(--lumiverse-text-muted); font-size: 12px; line-height: 1.45; }
    .ffmvu-status { white-space: pre-wrap; word-break: break-word; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 320px; overflow:auto; }
    .ffmvu-button { border:1px solid var(--lumiverse-border); background:var(--lumiverse-fill); color:var(--lumiverse-text); border-radius:var(--lumiverse-radius); padding:7px 10px; cursor:pointer; }
  `);
  const tab = ctx.ui.registerDrawerTab({ id: 'ffmvu-migration', title: 'FFMVU Migration', shortName: 'FFMVU', headerTitle: 'FFMVU', description: 'Live migration diagnostics for the FF+MVU Lumiverse bridge', keywords: ['mvu', 'ffmvu', 'migration', 'state'] });
  const root = document.createElement('div'); root.className = 'ffmvu-bridge';
  const controls = document.createElement('div'); controls.className = 'ffmvu-card';
  const row = document.createElement('div'); row.className = 'ffmvu-row';
  const title = document.createElement('div'); title.innerHTML = '<div class="ffmvu-title">P0 live bridge</div><div class="ffmvu-muted">Disabled by default. When armed, it freezes and injects MODEL_STATE for one diagnostic generation. Model patch commits remain disabled.</div>';
  const button = document.createElement('button'); button.className = 'ffmvu-button'; button.textContent = 'Loading…'; button.disabled = true;
  row.append(title, button); controls.appendChild(row);
  const statusCard = document.createElement('div'); statusCard.className = 'ffmvu-card';
  const statusTitle = document.createElement('div'); statusTitle.className = 'ffmvu-title'; statusTitle.textContent = 'Runtime status';
  const status = document.createElement('div'); status.className = 'ffmvu-status'; status.textContent = 'Waiting for backend…';
  statusCard.append(statusTitle, status); root.append(controls, statusCard); tab.root.appendChild(root);
  let enabled = false;
  function render(value: any) {
    enabled = value?.enabled === true;
    button.disabled = false;
    button.textContent = enabled ? 'Disarm bridge' : 'Arm bridge';
    status.textContent = JSON.stringify(value ?? {}, null, 2);
    tab.setBadge(value?.phase === 'blocked' || value?.phase === 'unreconciled' || value?.phase === 'probe_error' ? '!' : enabled ? 'DEV' : null);
  }
  button.addEventListener('click', () => { button.disabled = true; ctx.sendToBackend({ type: 'ffmvu_set_enabled', enabled: !enabled }); });
  const unsub = ctx.onBackendMessage((payload: any) => { if (payload?.type === 'ffmvu_status') render(payload.status); });
  const refresh = () => ctx.sendToBackend({ type: 'ffmvu_get_status' });
  tab.onActivate(refresh); refresh();
  return () => { unsub(); tab.destroy(); removeStyle(); ctx.dom.cleanup(); };
}
