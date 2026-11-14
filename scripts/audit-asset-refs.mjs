// 审计 public/assets 下每个文件是否真的被 src 用到。
// 判据三档：
//   literal   —— 源码里出现完整路径 / 文件名 / 无扩展名主干
//   pattern   —— 源码里有能拼出它的模板（如 `crew_${id}`、`d${pad(n)}`），需人工确认
//   orphan    —— 两样都没有 → 真·零引用
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'public');

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

const files = walk(SRC);
const chunks = files.map((f) => ({ f, txt: fs.readFileSync(f, 'utf8') }));
const all = chunks.map((c) => c.txt).join('\n');

function walkAssets(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkAssets(p, acc);
    else acc.push(p);
  }
  return acc;
}

const list = walkAssets(path.join(ASSETS, 'assets')).map((p) =>
  path.relative(ASSETS, p).split(path.sep).join('/'),
);

// 从源码里抓所有模板字符串片段，用来判 pattern 档
const templates = [...all.matchAll(/`[^`\n]*\$\{[^`\n]*`/g)].map((m) => m[0]);

const rows = list.map((rel) => {
  const base = path.posix.basename(rel);
  const stem = base.replace(/\.[a-z0-9]+$/, '');
  const ext = base.slice(stem.length);
  let where = null;
  if (all.includes(rel)) where = 'full-path';
  else if (all.includes(base)) where = 'filename';
  else if (new RegExp(`['"\`]${stem}['"\`]`).test(all)) where = 'stem-key';

  if (where) return { rel, tier: 'literal', where };

  // pattern：把文件名拆成 前缀 + 可变段 + 后缀，看有无模板能覆盖
  const pieces = stem.split('_');
  const guess = pieces.map((p) => (/^\d+$/.test(p) ? '\\d+' : p));
  const pat = new RegExp(guess.join('[_-]'));
  const tm = templates.find((t) => {
    const staticPart = t.replace(/\$\{[^}]*\}/g, '\u0000');
    const seg = staticPart.split('\u0000').filter((s) => s.length > 2);
    return seg.some((s) => stem.includes(s.replace(/[`'"]/g, '').replace(/^assets\//, '')));
  });
  if (pat && tm) return { rel, tier: 'pattern', where: tm.slice(0, 80) };

  // 扩展名也要对上（webp/png/svg 混用）
  return { rel, tier: 'orphan', where: ext };
});

const byTier = (t) => rows.filter((r) => r.tier === t);
for (const tier of ['orphan', 'pattern']) {
  const g = byTier(tier);
  console.log(`\n[${tier}] ${g.length}`);
  for (const r of g) console.log(`  ${r.rel}   <- ${r.where}`);
}
console.log(`\n合计 ${rows.length} 个文件：literal ${byTier('literal').length} / pattern ${byTier('pattern').length} / orphan ${byTier('orphan').length}`);
