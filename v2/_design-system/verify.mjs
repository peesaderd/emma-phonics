#!/usr/bin/env node
/* ============================================================
   verify.mjs — Kidobits design-system guard
   ใช้: node verify.mjs            (ตรวจ)
        node verify.mjs --update   (อัปเดต checksum ของ design-system)
        node verify.mjs --json     (ผลลัพธ์แบบเครื่องอ่าน)

   กติกา:
     ERROR  = ต้องแก้  (exit 1)
     WARN   = รายงาน ไม่บล็อก (exit 0)
   ============================================================ */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(DS);   // one level up: web root that contains _design-system/
const MANIFEST = join(DS, 'MANIFEST.json');

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update');
const AS_JSON = args.has('--json');

const errors = [];
const warns = [];
const notes = [];

const err = (code, msg) => errors.push({ code, msg });
const warn = (code, msg) => warns.push({ code, msg });

const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const read = p => readFileSync(p, 'utf8');

/* ---------- 1. files exist ---------- */
const REQUIRED = [
  '_design-system/tokens.css',
  '_design-system/components.css',
  '_design-system/examples/chapter-card.html',
  '_design-system/examples/lobby-layout.html',
  '_design-system/DESIGN-SYSTEM.md',
];
for (const f of REQUIRED) {
  if (!existsSync(join(ROOT, f))) err('DS_MISSING_FILE', `ไม่พบไฟล์ ${f}`);
}
if (errors.length) finish(); // everything below depends on them

let tokensCss, componentsCss, designDoc;
try {
  tokensCss = read(join(DS, 'tokens.css'));
  componentsCss = read(join(DS, 'components.css'));
  designDoc = read(join(DS, 'DESIGN-SYSTEM.md'));
} catch (e) {
  err('DS_UNREADABLE', String(e.message));
  finish();
}

/* ---------- 2. token extraction ---------- */
const rootBlock = (tokensCss.match(/:root\s*\{([\s\S]*?)\}/) || [])[1];
if (!rootBlock) err('TOKENS_NO_ROOT', 'tokens.css ไม่มีบล็อก :root');

const declared = new Set();
for (const m of (rootBlock || '').matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);

notes.push(`tokens: ${declared.size} ตัว`);

/* ---------- 3. components.css: ห้ามสีดิบ ---------- */
const compNoComments = componentsCss.replace(/\/\*[\s\S]*?\*\//g, '');

const rawHex = [...compNoComments.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
  .map(m => m[0]);
if (rawHex.length) {
  err('RAW_HEX', `components.css มีสีดิบ ${rawHex.length} จุด: ` +
      [...new Set(rawHex)].join(', ') +
      ' → ย้ายเข้า tokens.css แล้วใช้ var(--*)');
}

const rawRgba = [...compNoComments.matchAll(/\brgba?\(\s*\d/g)].map(m => m[0]);
if (rawRgba.length) {
  err('RAW_RGBA', `components.css มี rgba() ดิบ ${rawRgba.length} จุด → ย้ายเป็น token`);
}

/* ---------- 4. var(--x) ที่ไม่ถูกประกาศ ---------- */
const usedVars = new Set([...componentsCss.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
const undeclared = [...usedVars].filter(v => !declared.has(v));
if (undeclared.length) {
  err('UNDECLARED_TOKEN',
      `ใช้ token ที่ไม่มีใน tokens.css: ${undeclared.join(', ')}`);
}

/* ---------- 5. token ที่ประกาศแต่ไม่ถูกใช้ (WARN) ---------- */
const unused = [...declared].filter(v => !usedVars.has(v));
if (unused.length) {
  warn('UNUSED_TOKEN', `token ที่ไม่มีใครใช้ ${unused.length} ตัว: ${unused.join(', ')}`);
}

/* ---------- 6. allowed class list (สกัดจาก index.html) ---------- */
const ALLOWED_CLASSES = new Set([
  'wrap','hero','logo','pills','pill','buddy',
  'warm','wic','wt','ws','chev',
  'lvgrid','lvcard','anim','lvmeta','sub','prog','done',
  'modal','on','sheet','sid','srow',
  'btn','ghost','play',
]);

/* ---------- 7. ตรวจ example ว่าตรงกับ class list ---------- */
const exDir = join(DS, 'examples');
let exFiles = [];
try { exFiles = readdirSync(exDir).filter(f => f.endsWith('.html')); }
catch { err('EXAMPLES_MISSING', 'ไม่พบโฟลเดอร์ examples/'); }

for (const f of exFiles) {
  const src = read(join(exDir, f));
  const used = new Set();
  for (const m of src.matchAll(/class="([^"]*)"/g))
    for (const c of m[1].split(/\s+/)) if (c) used.add(c);

  const unknown = [...used].filter(c => !ALLOWED_CLASSES.has(c) && !c.startsWith('demo-'));
  if (unknown.length)
    err('EXAMPLE_UNKNOWN_CLASS',
        `${f} ใช้ class ที่ไม่มีใน design system: ${unknown.join(', ')}`);

  // example ต้องลิงก์ token/component ไม่ใช่ inline สี
  if (!src.includes('../tokens.css') || !src.includes('../components.css'))
    err('EXAMPLE_NO_LINK',
        `${f} ไม่ได้ link ../tokens.css และ ../components.css`);

  const inlineHex = [...src.matchAll(/style="[^"]*#[0-9a-fA-F]{3,8}/g)];
  if (inlineHex.length)
    warn('EXAMPLE_INLINE_HEX',
         `${f} มีสีใน style="" ${inlineHex.length} จุด (ควรเป็น var(--*))`);
}

/* ---------- 8. MANIFEST: fail-closed เฉพาะ design-system ---------- */
const LOCKED = [
  '_design-system/tokens.css',
  '_design-system/components.css',
  '_design-system/examples/chapter-card.html',
  '_design-system/examples/lobby-layout.html',
];

const current = {};
for (const f of LOCKED) current[f] = sha(readFileSync(join(ROOT, f)));

if (UPDATE) {
  writeFileSync(MANIFEST, JSON.stringify(
    { generated: new Date().toISOString(), locked: current, tracked: trackedIndexes() },
    null, 2) + '\n');
  notes.push('MANIFEST อัปเดตแล้ว');
} else if (!existsSync(MANIFEST)) {
  err('MANIFEST_MISSING', 'ไม่พบ MANIFEST.json → รัน node verify.mjs --update');
} else {
  const man = JSON.parse(read(MANIFEST));
  for (const [f, h] of Object.entries(current)) {
    const old = man.locked?.[f];
    if (!old) err('MANIFEST_UNKNOWN_FILE', `MANIFEST ไม่มีรายการ ${f}`);
    else if (old !== h)
      err('MANIFEST_DRIFT',
          `${f} ถูกแก้ (${old} → ${h}) — design system เปลี่ยน ` +
          `ถ้าตั้งใจ ให้รัน node verify.mjs --update แล้วอัปเดต DESIGN-SYSTEM.md`);
  }
}

/* ---------- 9. index.html / ไฟล์หน้า: แค่ WARN ---------- */
function trackedIndexes() {
  const out = {};
  for (const f of ['index.html', 'level.html', 'lesson.html', 'az.html']) {
    const p = join(ROOT, f);
    if (existsSync(p)) out[f] = sha(readFileSync(p));
  }
  return out;
}

const tracked = trackedIndexes();
const TRACK_NOTE = '_design-system/.tracked.json';
if (UPDATE) {
  writeFileSync(join(DS, '.tracked.json'), JSON.stringify(tracked, null, 2) + '\n');
} else if (existsSync(join(DS, '.tracked.json'))) {
  const before = JSON.parse(read(join(DS, '.tracked.json')));
  for (const [f, h] of Object.entries(tracked)) {
    if (before[f] && before[f] !== h)
      warn('PAGE_CHANGED', `${f} เปลี่ยนตั้งแต่ตรวจครั้งก่อน (ไม่บล็อก)`);
  }
}

/* ---------- 10. กันการ inline CSS ซ้ำในหน้าใหม่ ---------- */
const PAGE_RULE_HINT = /<style[\s\S]*?\.lvcard\s*\{/;
for (const f of ['index2.html', 'index3.html', 'index4.html']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const s = read(p);
  if (PAGE_RULE_HINT.test(s))
    warn('PAGE_REINLINES_DS',
         `${f} มี CSS ของ .lvcard ซ้ำใน <style> — ควร link design system แทน`);
}

/* ---------- report ---------- */
function finish() {
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors, warns, notes }, null, 2));
  } else {
    console.log('');
    console.log('Kidobits Design System — verify');
    console.log('='.repeat(46));
    if (errors.length) {
      console.log(`\n✗ ERROR ${errors.length}`);
      for (const e of errors) console.log(`  [${e.code}] ${e.msg}`);
    } else {
      console.log('\n✓ ERROR 0 — ผ่าน');
    }
    if (warns.length) {
      console.log(`\n⚠ WARN ${warns.length}`);
      for (const w of warns) console.log(`  [${w.code}] ${w.msg}`);
    }
    if (notes.length) {
      console.log('\n· notes');
      for (const n of notes) console.log(`  ${n}`);
    }
    console.log('');
  }
  process.exit(errors.length ? 1 : 0);
}

finish();
