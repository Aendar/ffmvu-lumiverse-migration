import { readFile, writeFile } from 'node:fs/promises';

const parts = [
  'dist/src/shared/domain/value-utils.js',
  'dist/src/lumi/statusmenu-model.js',
  'dist/src/lumi/frontend.js',
];

function stripSourceMap(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
}

function stripKnownImports(path, text) {
  let out = text;
  if (path.endsWith('statusmenu-model.js')) {
    out = out.replace(
      /^import \{ asRecord, isRecord, text, tupleValue \} from '\.\.\/shared\/domain\/value-utils\.js';\n/,
      '',
    );
  }
  if (path.endsWith('frontend.js')) {
    out = out.replace(
      /^import \{ asRecord, isRecord \} from '\.\.\/shared\/domain\/value-utils\.js';\n/,
      '',
    );
    out = out.replace(
      /^import \{ statusCompactObject, statusCoreBudget, statusHphOverview, statusItems, statusNumber, statusOwnerById, statusOwners, statusText, \} from '\.\/statusmenu-model\.js';\n/,
      '',
    );
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
