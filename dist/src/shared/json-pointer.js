import { clone, isRecord, text } from './domain/value-utils.js';
export function pointerParts(pathValue) {
    if (pathValue === '')
        return [];
    if (typeof pathValue !== 'string' || !pathValue.startsWith('/'))
        throw new Error('Invalid JSON Pointer: ' + text(pathValue));
    return pathValue.slice(1).split('/').map(part => {
        const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
        if (['__proto__', 'prototype', 'constructor'].includes(decoded))
            throw new Error('Unsafe JSON Pointer segment');
        return decoded;
    });
}
function pointerParent(root, pathValue) {
    const parts = pointerParts(pathValue);
    if (!parts.length)
        return { root: true, parent: null, key: '' };
    let parent = root;
    for (const part of parts.slice(0, -1)) {
        if (Array.isArray(parent)) {
            const index = Number(part);
            if (!Number.isInteger(index) || index < 0 || index >= parent.length)
                throw new Error('Missing array path: ' + pathValue);
            parent = parent[index];
        }
        else {
            if (!isRecord(parent) || !Object.prototype.hasOwnProperty.call(parent, part))
                throw new Error('Missing object path: ' + pathValue);
            parent = parent[part];
        }
    }
    return { root: false, parent, key: parts.at(-1) ?? '' };
}
export function pointerGet(root, pathValue) {
    const parts = pointerParts(pathValue);
    let value = root;
    for (const part of parts) {
        if (Array.isArray(value)) {
            const index = Number(part);
            if (!Number.isInteger(index) || index < 0 || index >= value.length)
                throw new Error('Missing array path: ' + pathValue);
            value = value[index];
        }
        else {
            if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, part))
                throw new Error('Missing object path: ' + pathValue);
            value = value[part];
        }
    }
    return value;
}
export function pointerAdd(root, pathValue, value) {
    const target = pointerParent(root, pathValue);
    if (target.root)
        return clone(value);
    if (Array.isArray(target.parent)) {
        if (target.key === '-')
            target.parent.push(clone(value));
        else {
            const index = Number(target.key);
            if (!Number.isInteger(index) || index < 0 || index > target.parent.length)
                throw new Error('Invalid array add: ' + pathValue);
            target.parent.splice(index, 0, clone(value));
        }
    }
    else {
        if (!isRecord(target.parent))
            throw new Error('Invalid add target: ' + pathValue);
        target.parent[target.key] = clone(value);
    }
    return root;
}
export function pointerRemove(root, pathValue) {
    const target = pointerParent(root, pathValue);
    if (target.root)
        throw new Error('Removing the state root is not allowed');
    if (Array.isArray(target.parent)) {
        const index = Number(target.key);
        if (!Number.isInteger(index) || index < 0 || index >= target.parent.length)
            throw new Error('Invalid array remove: ' + pathValue);
        target.parent.splice(index, 1);
    }
    else {
        if (!isRecord(target.parent) || !Object.prototype.hasOwnProperty.call(target.parent, target.key))
            throw new Error('Missing remove path: ' + pathValue);
        delete target.parent[target.key];
    }
    return root;
}
export function pointerReplace(root, pathValue, value) {
    const target = pointerParent(root, pathValue);
    if (target.root)
        return clone(value);
    if (Array.isArray(target.parent)) {
        const index = Number(target.key);
        if (!Number.isInteger(index) || index < 0 || index >= target.parent.length)
            throw new Error('Invalid array replace: ' + pathValue);
        target.parent[index] = clone(value);
    }
    else {
        if (!isRecord(target.parent) || !Object.prototype.hasOwnProperty.call(target.parent, target.key))
            throw new Error('Missing replace path: ' + pathValue);
        target.parent[target.key] = clone(value);
    }
    return root;
}
//# sourceMappingURL=json-pointer.js.map