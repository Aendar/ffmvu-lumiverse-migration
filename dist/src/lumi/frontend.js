export function setup(ctx) {
    const removeStyle = ctx.dom.addStyle(`
    .ffmvu-bridge { padding: 14px; display: grid; gap: 12px; color: var(--lumiverse-text); }
    .ffmvu-card { padding: 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); }
    .ffmvu-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .ffmvu-title { font-weight: 700; }
    .ffmvu-muted { color: var(--lumiverse-text-muted); font-size: 12px; line-height: 1.45; }
    .ffmvu-status { white-space: pre-wrap; word-break: break-word; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 320px; overflow:auto; }
    .ffmvu-button { border:1px solid var(--lumiverse-border); background:var(--lumiverse-fill); color:var(--lumiverse-text); border-radius:var(--lumiverse-radius); padding:7px 10px; cursor:pointer; }
  `);
    const tab = ctx.ui.registerDrawerTab({ id: 'ffmvu-migration', title: 'FFMVU Migration', shortName: 'FFMVU', headerTitle: 'FFMVU', description: 'FF+MVU Lumiverse model commit pipeline diagnostics', keywords: ['mvu', 'ffmvu', 'migration', 'state'] });
    const root = document.createElement('div');
    root.className = 'ffmvu-bridge';
    const controls = document.createElement('div');
    controls.className = 'ffmvu-card';
    const row = document.createElement('div');
    row.className = 'ffmvu-row';
    const title = document.createElement('div');
    title.innerHTML = '<div class="ffmvu-title">v0.8.0 migration bridge</div><div class="ffmvu-muted">When armed, the bridge commits model state through the proven lifecycle path. Assistant history is annotated with in-world World.Date/World.Time metadata and net off-screen RecentChanges.</div>';
    const button = document.createElement('button');
    button.className = 'ffmvu-button';
    button.textContent = 'Loading…';
    button.disabled = true;
    const probeButton = document.createElement('button');
    probeButton.className = 'ffmvu-button';
    probeButton.textContent = 'Arm no-patch probe';
    probeButton.disabled = true;
    const buttonBox = document.createElement('div');
    buttonBox.style.display = 'flex';
    buttonBox.style.gap = '8px';
    buttonBox.style.flexWrap = 'wrap';
    buttonBox.append(button, probeButton);
    row.append(title, buttonBox);
    controls.appendChild(row);
    const statusCard = document.createElement('div');
    statusCard.className = 'ffmvu-card';
    const statusTitle = document.createElement('div');
    statusTitle.className = 'ffmvu-title';
    statusTitle.textContent = 'Runtime status';
    const status = document.createElement('div');
    status.className = 'ffmvu-status';
    status.textContent = 'Waiting for backend…';
    statusCard.append(statusTitle, status);
    root.append(controls, statusCard);
    tab.root.appendChild(root);
    let enabled = false;
    function render(value) {
        if (typeof value?.enabled === 'boolean')
            enabled = value.enabled;
        button.disabled = false;
        button.textContent = enabled ? 'Disarm commits' : 'Arm commits';
        probeButton.disabled = !enabled || value?.noPatchProbeArmed === true;
        probeButton.textContent = value?.noPatchProbeArmed === true ? 'No-patch probe armed' : 'Arm no-patch probe';
        status.textContent = JSON.stringify(value ?? {}, null, 2);
        tab.setBadge(['blocked', 'unreconciled', 'failed_patch', 'commit_error', 'model_commit_conflict', 'swipe_navigation_error', 'swipe_navigation_unreconciled', 'stopped_unreconciled', 'stopped_reconciliation_error'].includes(value?.phase) ? '!' : value?.phase === 'commit_complete' ? 'OK' : value?.phase === 'swipe_navigated' ? 'NAV' : value?.phase === 'stopped_durable' ? 'STOP' : value?.phase === 'continue_probe_complete' ? 'CONT' : enabled ? 'DEV' : null);
    }
    button.addEventListener('click', () => { button.disabled = true; ctx.sendToBackend({ type: 'ffmvu_set_enabled', enabled: !enabled }); });
    probeButton.addEventListener('click', () => { probeButton.disabled = true; ctx.sendToBackend({ type: 'ffmvu_arm_no_patch_probe' }); });
    const unsub = ctx.onBackendMessage((payload) => { if (payload?.type === 'ffmvu_status')
        render(payload.status); });
    const refresh = () => ctx.sendToBackend({ type: 'ffmvu_get_status' });
    tab.onActivate(refresh);
    refresh();
    return () => { unsub(); tab.destroy(); removeStyle(); ctx.dom.cleanup(); };
}
//# sourceMappingURL=frontend.js.map