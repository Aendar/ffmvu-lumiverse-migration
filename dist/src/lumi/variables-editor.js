import { isGuiVariableCoupledDomainPath, isGuiVariableDynamicCollectionPath } from '../shared/domain/gui-variable-policy.js';
import { isRecord } from '../shared/domain/value-utils.js';
import { isLabeledTupleAtPath } from '../shared/domain/tuple-paths.js';
export const VARIABLES_EDITOR_CSS = `
  .ve-shell{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;color:var(--text-primary);}
  .ve-toolbar{display:flex;align-items:center;gap:6px;position:sticky;top:0;z-index:4;padding:4px 0 8px;background:rgba(0,31,63,.96);}
  .ve-search{flex:1;min-width:0;background:rgba(0,0,0,.22);border:1px solid var(--border-color);color:var(--text-primary);padding:7px 9px;border-radius:5px;outline:none;}
  .ve-search:focus{border-color:var(--accent-primary);box-shadow:0 0 0 1px rgba(0,229,255,.16);}
  .ve-hint{font-size:.76em;color:var(--text-secondary);white-space:nowrap;}
  .ve-tree{display:flex;flex-direction:column;gap:4px;padding-bottom:12px;}
  .ve-node,.ve-leaf{border:1px solid rgba(0,229,255,.18);border-radius:5px;background:rgba(0,12,28,.28);}
  .ve-node>summary{display:flex;align-items:center;gap:6px;min-height:34px;padding:5px 7px;cursor:pointer;list-style:none;}
  .ve-node>summary::-webkit-details-marker{display:none;}
  .ve-node>summary::before{content:'▸';color:var(--text-secondary);width:12px;flex:0 0 12px;}
  .ve-node[open]>summary::before{content:'▾';color:var(--accent-primary);}
  .ve-key{font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ve-meta{font-size:.72em;color:var(--text-secondary);opacity:.8;white-space:nowrap;}
  .ve-count{font-size:.7em;color:var(--text-secondary);border:1px solid rgba(129,212,250,.2);border-radius:10px;padding:1px 6px;}
  .ve-spacer{flex:1;}
  .ve-actions{display:flex;align-items:center;gap:3px;flex:0 0 auto;}
  .ve-btn{border:1px solid rgba(0,229,255,.25);background:rgba(0,229,255,.07);color:var(--text-secondary);border-radius:4px;padding:3px 7px;cursor:pointer;font-size:.74em;line-height:1.25;}
  .ve-btn:hover:not(:disabled){color:var(--accent-primary);border-color:rgba(0,229,255,.55);background:rgba(0,229,255,.12);}
  .ve-btn.danger{color:#ff9a9a;border-color:rgba(255,100,100,.25);background:rgba(255,80,80,.05);}
  .ve-btn.danger:hover:not(:disabled){color:#ff6b6b;border-color:rgba(255,100,100,.55);}
  .ve-btn:disabled{opacity:.35;cursor:not-allowed;}
  .ve-children{display:flex;flex-direction:column;gap:4px;padding:0 6px 6px 18px;}
  .ve-leaf{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(180px,1.4fr) auto;align-items:center;gap:7px;padding:6px 7px;}
  .ve-value{min-width:0;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:pre-wrap;word-break:break-word;max-height:4.8em;overflow-y:auto;}
  .ve-type{font-size:.68em;color:var(--text-secondary);opacity:.72;margin-left:5px;}
  .ve-empty{padding:16px;text-align:center;color:var(--text-secondary);}
  .ve-modal-overlay{position:absolute;inset:0;z-index:60000;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;backdrop-filter:blur(2px);}
  .ve-modal{width:min(520px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;background:#001f3f;border:1px solid var(--accent-primary);border-radius:7px;padding:14px;color:var(--text-primary);box-shadow:0 16px 48px rgba(0,0,0,.48);}
  .ve-modal-title{font-weight:700;color:var(--accent-primary);font-size:1.05em;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid var(--border-color);}
  .ve-field{display:flex;flex-direction:column;gap:5px;margin:9px 0;}
  .ve-field>label{font-size:.78em;color:var(--text-secondary);}
  .ve-input,.ve-textarea,.ve-select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.25);border:1px solid var(--border-color);border-radius:5px;color:var(--text-primary);padding:8px;outline:none;}
  .ve-textarea{min-height:110px;resize:vertical;}
  .ve-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px;}
  .ve-path{font-size:.7em;color:var(--text-secondary);opacity:.7;word-break:break-all;margin-top:2px;}
  @media(max-width:680px){.ve-leaf{grid-template-columns:1fr;}.ve-actions{justify-content:flex-start;}.ve-hint{display:none;}}
`;
const VE_PROTECTED_ROOT = new Set([
    'World_Calc', 'World', 'Mainchar', 'Familiar', 'Narrative',
    'MVUStatMenu_DB_Ver', 'GameStarted',
]);
const RETIRED_NPC_FIELDS = new Set(['CurrentThought', 'Mental_state', 'InternalThoughts', 'Thoughts']);
/**
 * Returns true for state paths that are kept only for legacy replay/migration
 * compatibility and must not be presented as editable current variables.
 * This is a display rule only; it never mutates the authoritative state.
 */
export function isStatePathHiddenFromUi(path) {
    if (path.length === 1 && (path[0] === 'ProjectionMeta' || path[0] === 'ColdIndex'))
        return true;
    if (path.length >= 2 && path[0] === 'Mainchar' && path[1] === 'Mental_state')
        return true;
    if (path.length >= 2 && path[0] === 'Narrative' && path[1] === 'Chekhov')
        return true;
    if (path.length >= 4 && path[0] === 'Narrative' && path[1] === 'NPCs' && RETIRED_NPC_FIELDS.has(path[3]))
        return true;
    if (path.length >= 3 && path[0] === 'Familiar' && RETIRED_NPC_FIELDS.has(path[2]))
        return true;
    return false;
}
/** Whether a state contains any retired paths that are currently hidden. */
export function hasRetiredStateFields(state) {
    let found = false;
    const visit = (value, path) => {
        if (found || isStatePathHiddenFromUi(path)) {
            found = true;
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((child, index) => visit(child, [...path, String(index)]));
            return;
        }
        if (isRecord(value)) {
            for (const [key, child] of Object.entries(value))
                visit(child, [...path, key]);
        }
    };
    visit(state, []);
    return found;
}
function veIsTuple(path, value) {
    return isLabeledTupleAtPath(path, value);
}
function veType(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
function vePrimitiveText(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'string')
        return value || '""';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number')
        return String(value);
    return String(value ?? '');
}
function veCloneJson(value) {
    return structuredClone(value);
}
function vePathText(path) {
    return path.join(' › ');
}
function veCanEditValue(path) {
    return !(path.length === 1 && VE_PROTECTED_ROOT.has(path[0])) && !isGuiVariableCoupledDomainPath(path);
}
function veCanManageEntry(path) {
    return isGuiVariableDynamicCollectionPath(path.slice(0, -1));
}
function veMatches(key, value, query, path, depth = 0) {
    if (!query)
        return true;
    if (depth > 20)
        return false;
    if (key.toLocaleLowerCase('ru').includes(query))
        return true;
    if (veIsTuple(path, value))
        return veMatches(key, value[0], query, [...path, '0'], depth + 1) || value[1].toLocaleLowerCase('ru').includes(query);
    if (value === null || typeof value !== 'object')
        return vePrimitiveText(value).toLocaleLowerCase('ru').includes(query);
    if (Array.isArray(value))
        return value.some((child, index) => veMatches(String(index), child, query, [...path, String(index)], depth + 1));
    if (isRecord(value))
        return Object.entries(value).some(([childKey, child]) => veMatches(childKey, child, query, [...path, childKey], depth + 1));
    return false;
}
function veButton(label, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 've-btn' + (className ? ' ' + className : '');
    button.textContent = label;
    return button;
}
function veModalBase(root, title) {
    root.getElementById('ve-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 've-modal-overlay';
    overlay.className = 've-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 've-modal';
    const heading = document.createElement('div');
    heading.className = 've-modal-title';
    heading.textContent = title;
    modal.appendChild(heading);
    overlay.appendChild(modal);
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => { if (event.target === overlay)
        close(); });
    const modalLayer = root.querySelector('.status-body');
    (modalLayer ?? root).appendChild(overlay);
    return { overlay, modal, close };
}
function veModalActions(modal, close, saveLabel, onSave) {
    const actions = document.createElement('div');
    actions.className = 've-modal-actions';
    const cancel = veButton('Cancel');
    const save = veButton(saveLabel);
    save.style.color = 'var(--accent-primary)';
    cancel.addEventListener('click', close);
    save.addEventListener('click', onSave);
    actions.append(cancel, save);
    modal.appendChild(actions);
}
function veShowEdit(root, path, value, options) {
    const dialog = veModalBase(root, 'Edit value');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(path);
    dialog.modal.appendChild(pathLine);
    const field = document.createElement('div');
    field.className = 've-field';
    const label = document.createElement('label');
    label.textContent = 'Value';
    field.appendChild(label);
    let read;
    if (typeof value === 'boolean') {
        const select = document.createElement('select');
        select.className = 've-select';
        for (const bool of [true, false]) {
            const option = document.createElement('option');
            option.value = String(bool);
            option.textContent = String(bool);
            option.selected = bool === value;
            select.appendChild(option);
        }
        field.appendChild(select);
        read = () => select.value === 'true';
    }
    else if (typeof value === 'number') {
        const input = document.createElement('input');
        input.className = 've-input';
        input.type = 'number';
        input.step = 'any';
        input.value = String(value);
        field.appendChild(input);
        read = () => {
            const number = Number(input.value);
            if (!Number.isFinite(number))
                throw new Error('Value must be a finite number');
            return number;
        };
    }
    else {
        const input = document.createElement('textarea');
        input.className = 've-textarea';
        input.value = value === null ? '' : String(value ?? '');
        field.appendChild(input);
        read = () => input.value;
    }
    dialog.modal.appendChild(field);
    veModalActions(dialog.modal, dialog.close, 'Save', () => {
        try {
            options.onIntent({ type: 'variable.set', path, value: read() });
            dialog.close();
        }
        catch (error) {
            window.alert(String(error));
        }
    });
}
function veShowRename(root, path, key, options) {
    const dialog = veModalBase(root, 'Rename key');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(path.slice(0, -1));
    dialog.modal.appendChild(pathLine);
    const field = document.createElement('div');
    field.className = 've-field';
    const label = document.createElement('label');
    label.textContent = 'New name';
    const input = document.createElement('input');
    input.className = 've-input';
    input.value = key;
    field.append(label, input);
    dialog.modal.appendChild(field);
    veModalActions(dialog.modal, dialog.close, 'Rename', () => {
        const newKey = input.value.trim();
        if (!newKey)
            return;
        options.onIntent({ type: 'variable.rename', path, newKey });
        dialog.close();
    });
    queueMicrotask(() => { input.focus(); input.select(); });
}
function veShowAdd(root, parentPath, parent, options) {
    const dialog = veModalBase(root, 'Add entry');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(parentPath) || 'State';
    dialog.modal.appendChild(pathLine);
    const keyField = document.createElement('div');
    keyField.className = 've-field';
    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'Name';
    const keyInput = document.createElement('input');
    keyInput.className = 've-input';
    keyInput.placeholder = 'New entry';
    keyField.append(keyLabel, keyInput);
    const structureField = document.createElement('div');
    structureField.className = 've-field';
    const structureLabel = document.createElement('label');
    structureLabel.textContent = 'Structure';
    const structure = document.createElement('select');
    structure.className = 've-select';
    const basics = [
        ['object', 'Empty object'],
        ['text', 'Text'],
        ['number', 'Number'],
        ['boolean', 'Boolean'],
    ];
    for (const [value, labelText] of basics) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelText;
        structure.appendChild(option);
    }
    for (const siblingKey of Object.keys(parent).slice(0, 80)) {
        const option = document.createElement('option');
        option.value = 'copy:' + siblingKey;
        option.textContent = 'Copy structure/value from “' + siblingKey + '”';
        structure.appendChild(option);
    }
    structureField.append(structureLabel, structure);
    dialog.modal.append(keyField, structureField);
    veModalActions(dialog.modal, dialog.close, 'Add', () => {
        const key = keyInput.value.trim();
        if (!key)
            return;
        let value;
        if (structure.value === 'text')
            value = '';
        else if (structure.value === 'number')
            value = 0;
        else if (structure.value === 'boolean')
            value = false;
        else if (structure.value.startsWith('copy:')) {
            const sourceKey = structure.value.slice(5);
            value = veCloneJson(parent[sourceKey]);
        }
        else
            value = {};
        options.onIntent({ type: 'variable.add', parentPath, key, value });
        dialog.close();
    });
    queueMicrotask(() => keyInput.focus());
}
function veActionButtons(root, path, key, value, parentIsArray, options) {
    const actions = document.createElement('div');
    actions.className = 've-actions';
    const editable = veCanEditValue(path);
    const manageable = !parentIsArray && veCanManageEntry(path);
    if (editable && (value === null || typeof value !== 'object' || veIsTuple(path, value))) {
        const edit = veButton('Edit');
        edit.disabled = options.mutationDisabled;
        edit.addEventListener('click', event => {
            event.stopPropagation();
            const editPath = veIsTuple(path, value) ? [...path, '0'] : path;
            const editValue = veIsTuple(path, value) ? value[0] : value;
            veShowEdit(root, editPath, editValue, options);
        });
        actions.appendChild(edit);
    }
    if (manageable) {
        const rename = veButton('Rename');
        rename.disabled = options.mutationDisabled;
        rename.addEventListener('click', event => {
            event.stopPropagation();
            veShowRename(root, path, key, options);
        });
        actions.appendChild(rename);
    }
    if (manageable) {
        const remove = veButton('Delete', 'danger');
        remove.disabled = options.mutationDisabled;
        remove.addEventListener('click', event => {
            event.stopPropagation();
            if (!window.confirm('Delete “' + key + '”?'))
                return;
            options.onIntent({ type: 'variable.delete', path });
        });
        actions.appendChild(remove);
    }
    return actions;
}
function veRenderEntry(root, key, value, path, parentIsArray, depth, query, options) {
    if (isStatePathHiddenFromUi(path))
        return null;
    if (!veMatches(key, value, query, path))
        return null;
    const tuple = veIsTuple(path, value);
    const effectiveValue = tuple ? value[0] : value;
    const isContainer = !tuple && effectiveValue !== null && typeof effectiveValue === 'object';
    if (!isContainer) {
        const row = document.createElement('div');
        row.className = 've-leaf';
        const keyBox = document.createElement('div');
        const keyLine = document.createElement('div');
        keyLine.className = 've-key';
        keyLine.textContent = key;
        keyBox.appendChild(keyLine);
        if (tuple) {
            const label = document.createElement('div');
            label.className = 've-meta';
            label.textContent = value[1];
            keyBox.appendChild(label);
        }
        const valueBox = document.createElement('div');
        valueBox.className = 've-value';
        valueBox.textContent = vePrimitiveText(effectiveValue);
        row.append(keyBox, valueBox, veActionButtons(root, path, key, value, parentIsArray, options));
        return row;
    }
    const details = document.createElement('details');
    details.className = 've-node';
    details.open = Boolean(query) || depth < 1;
    const summary = document.createElement('summary');
    const keyElement = document.createElement('span');
    keyElement.className = 've-key';
    keyElement.textContent = key;
    const childEntries = Array.isArray(effectiveValue)
        ? effectiveValue.map((child, index) => [String(index), child])
        : Object.entries(effectiveValue);
    const visibleEntries = childEntries.filter(([childKey]) => !isStatePathHiddenFromUi([...path, childKey]));
    const count = document.createElement('span');
    count.className = 've-count';
    count.textContent = String(visibleEntries.length);
    const spacer = document.createElement('span');
    spacer.className = 've-spacer';
    summary.append(keyElement, count, spacer, veActionButtons(root, path, key, value, parentIsArray, options));
    const children = document.createElement('div');
    children.className = 've-children';
    if (Array.isArray(effectiveValue)) {
        visibleEntries.forEach(([childKey, child]) => {
            const rendered = veRenderEntry(root, childKey, child, [...path, childKey], true, depth + 1, query, options);
            if (rendered)
                children.appendChild(rendered);
        });
    }
    else {
        const object = effectiveValue;
        for (const [childKey, child] of visibleEntries) {
            const rendered = veRenderEntry(root, childKey, child, [...path, childKey], false, depth + 1, query, options);
            if (rendered)
                children.appendChild(rendered);
        }
        if (isGuiVariableDynamicCollectionPath(path)) {
            const add = veButton('+ Add entry');
            add.disabled = options.mutationDisabled;
            add.style.alignSelf = 'flex-start';
            add.addEventListener('click', event => {
                event.stopPropagation();
                veShowAdd(root, path, object, options);
            });
            children.appendChild(add);
        }
    }
    if (!children.children.length) {
        const empty = document.createElement('div');
        empty.className = 've-empty';
        empty.textContent = 'No matching entries';
        children.appendChild(empty);
    }
    details.append(summary, children);
    return details;
}
export function renderVariablesEditor(root, options) {
    const shell = document.createElement('div');
    shell.className = 've-shell';
    const toolbar = document.createElement('div');
    toolbar.className = 've-toolbar';
    const search = document.createElement('input');
    search.className = 've-search';
    search.type = 'search';
    search.placeholder = 'Search variables…';
    search.value = options.search;
    const hint = document.createElement('span');
    hint.className = 've-hint';
    hint.textContent = 'Edit values · manage user entries';
    toolbar.append(search, hint);
    const tree = document.createElement('div');
    tree.className = 've-tree';
    const draw = () => {
        tree.replaceChildren();
        const query = search.value.trim().toLocaleLowerCase('ru');
        for (const [key, value] of Object.entries(options.state)) {
            const rendered = veRenderEntry(root, key, value, [key], false, 0, query, options);
            if (rendered)
                tree.appendChild(rendered);
        }
        if (!tree.children.length) {
            const empty = document.createElement('div');
            empty.className = 've-empty';
            empty.textContent = 'Nothing found';
            tree.appendChild(empty);
        }
    };
    search.addEventListener('input', () => {
        options.onSearch(search.value);
        draw();
    });
    shell.append(toolbar, tree);
    draw();
    return shell;
}
//# sourceMappingURL=variables-editor.js.map