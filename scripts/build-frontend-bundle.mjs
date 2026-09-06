import { readFile, writeFile } from 'node:fs/promises';

const parts = [
  'dist/src/shared/domain/value-utils.js',
  'dist/src/shared/domain/gui-variable-policy.js',
  'dist/src/lumi/statusmenu-model.js',
  'dist/src/lumi/statusmenu-legacy-template.js',
  'dist/src/lumi/variables-editor.js',
  'dist/src/lumi/statusmenu-legacy-view.js',
  'dist/src/lumi/frontend.js',
];

function stripSourceMap(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
}

function stripKnownImports(_path, text) {
  const localDependencies = new Set([
    '../shared/domain/value-utils.js',
    '../shared/domain/gui-variable-policy.js',
    './statusmenu-model.js',
    './statusmenu-legacy-template.js',
    './variables-editor.js',
    './statusmenu-legacy-view.js',
  ]);

  return text.replace(
    /^import\s+[^;]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (statement, dependency) => localDependencies.has(dependency) ? '' : statement,
  );
}

const chunks = [];
for (const path of parts) {
  let source = await readFile(path, 'utf8');
  source = stripKnownImports(path, stripSourceMap(source));
  chunks.push(`// ---- bundled from ${path} ----\n${source.trim()}\n`);
}

const bundle = chunks.join('\n');
if (/^\s*import\s/m.test(bundle)) {
  throw new Error('Frontend bundle still contains static import statements; update scripts/build-frontend-bundle.mjs.');
}
if (!/export function setup\s*\(/.test(bundle)) {
  throw new Error('Frontend bundle does not export setup().');
}
if (!/function isGuiVariableDynamicCollectionPath\s*\(/.test(bundle)) {
  throw new Error('Frontend bundle is missing the Variables collection policy helper.');
}

const declared = [];
for (const match of bundle.matchAll(/^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) declared.push(match[1]);
for (const match of bundle.matchAll(/^(?:export\s+)?(?:const|let|class)\s+([A-Za-z_$][\w$]*)\b/gm)) declared.push(match[1]);
const duplicateDeclarations = [...new Set(declared.filter((name, index) => declared.indexOf(name) !== index))];
if (duplicateDeclarations.length) {
  throw new Error('Frontend bundle has duplicate top-level declarations: ' + duplicateDeclarations.join(', '));
}

await writeFile('dist/frontend.js', bundle, 'utf8');
console.log('dist/frontend.js bundled OK');
