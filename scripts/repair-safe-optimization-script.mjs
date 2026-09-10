import fs from 'node:fs';

const file = 'scripts/apply-safe-optimization-slices.mjs';
let text = fs.readFileSync(file, 'utf8');
const edits = [
  ["replaceBetween(file, 'const EQUIP_STAT_MAP:', 'function same(', 'function same(');", "replaceBetween(file, 'const EQUIP_STAT_MAP:', 'function same(', '');"],
  ["replaceBetween(file, 'function numericValue(', 'function uniqueKey(', 'function uniqueKey(');", "replaceBetween(file, 'function numericValue(', 'function uniqueKey(', '');"],
  ["replaceBetween(file, 'function equippedInSlot(', 'function mergeExistingEditableFields(', 'function mergeExistingEditableFields(');", "replaceBetween(file, 'function equippedInSlot(', 'function mergeExistingEditableFields(', '');"],
];
for (const [from, to] of edits) {
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) throw new Error(`Expected one migration-script marker edit, found ${occurrences}: ${from}`);
  text = text.replace(from, to);
}
fs.writeFileSync(file, text);
console.log('Repaired guarded migration marker replacements.');
