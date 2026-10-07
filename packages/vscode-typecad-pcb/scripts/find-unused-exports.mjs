// One-off dead-export scan: lists exported symbols never referenced by any
// other src/ or test file. Run: node scripts/find-unused-exports.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'helpers' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)],
  );
const all = walk(path.join(root, 'src')).filter((f) => f.endsWith('.ts'));
const srcFiles = all.filter((f) => !f.includes('__tests__'));
const testText = all.filter((f) => f.includes('__tests__')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const exportsOf = {};
for (const f of srcFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of text.matchAll(/export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export \{([^}]+)\}/g))
    for (const piece of m[1].split(',')) {
      const n = piece.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  for (const m of text.matchAll(/export (?:type|interface) ([A-Za-z0-9_]+)/g)) names.add(m[1]);
  exportsOf[f] = [...names].filter(Boolean);
}

for (const [file, names] of Object.entries(exportsOf)) {
  for (const name of names) {
    if (name === 'activate' || name === 'deactivate') continue;
    const word = new RegExp(`\\b${name}\\b`, 'g');
    // strip the symbol's own declaration so its definition doesn't count as a use
    const stripDecl = (text) =>
      text.replace(new RegExp(`export (?:async )?(?:function|const|class|type|interface) ${name}\\b`, 'g'), '');
    const usedInSrc = srcFiles.some((g) => g !== file && word.test(stripDecl(fs.readFileSync(g, 'utf8'))));
    const usedInTests = word.test(testText);
    if (!usedInSrc && !usedInTests) console.log('UNUSED:', path.relative(root, file), '->', name);
  }
}
