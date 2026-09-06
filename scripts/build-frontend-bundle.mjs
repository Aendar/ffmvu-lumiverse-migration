import { readFile, writeFile } from 'node:fs/promises';

const parts = [
  'dist/src/shared/domain/value-utils.js',
  'dist/src/lumi/statusmenu-model.js',
  'dist/src/lumi/statusmenu-legacy-template.js',
  'dist/src/lumi/statusmenu-legacy-view.js',
  'dist/src/lumi/frontend.js',
];

function stripSourceMap(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
}

function stripKnownImports(_path, text) {
  const localDependencies = [
    '../shared/domain/value-utils.js',
    './statusmenu-model.js',
    './statusmenu-legacy-template.js',
    './statusmenu-legacy-view.js',
  ];
  let out = text;
  for (const dependency of localDependencies) {
    const escaped = dependency.replace(/[.*+?^$()|[\\]\\\\]/g, '\\$&');
    const pattern = '^import\\s+[\\s\\S]*?\\s+from\\s+[\\\"\\\']' + escaped + '[\\\"\\\'];?\\s*$';
    out = out.replace(new RegExp(pattern, 'gm'), '');
  }
  return out;
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

await writeFile('dist/frontend.js', bundle, 'utf8');
console.log('dist/frontend.js bundled OK');
