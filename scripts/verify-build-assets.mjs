/* 分发核查：按当前 vite.config.js 构建到全新隔离目录，逐项核对分发面。
   运行：node scripts/verify-build-assets.mjs --out <全新输出目录>
   安全约定：输出目录必须是全新目录——已存在（含空目录、残留产物）、public 内、dist 内、
     工程根及其祖先、经由符号链接/junction 的路径，一律拒绝且不写入、不清空、不删除。
     构建以 emptyOutDir:false 运行，目录由脚本在构建前原子创建。
   核查项：
     1) 已排除件不进入产物（A 组 6 件 + B 组退役件，按精确路径与文件名两种口径查）；
     2) 正向对照：public/ 中除排除项外的每一件都在产物中且字节一致；必需图片 / seed / 英歌资源齐备；
     3) B 组退役件已无加载路径引用（否则构建前即失败，避免上线后裂图）；
     4) public/ 源目录构建前后逐字节不变（原件保留，不移动不删除）；
     5) 原有 dist/ 构建前后不被写入；
     6) 产物里 bundle 部分正常生成（index.html / yingge/index.html / js / css）。 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import {
  PUBLIC_BUILD_EXCLUDE,
  PUBLIC_BUILD_EXCLUDE_CONFIRMED,
  PUBLIC_BUILD_EXCLUDE_RETIRED,
} from './build-public-filter.mjs';
import { createFreshOutDir } from './build-safe-outdir.mjs';

var here = dirname(fileURLToPath(import.meta.url));
var root = resolve(here, '..');
var publicDir = join(root, 'public');
var distDir = join(root, 'dist');

function argValue(name) {
  var i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

/* 目录清单：相对路径 → sha256（用于逐字节比对） */
function manifest(dir) {
  var map = new Map();
  if (!existsSync(dir)) return map;
  (function walk(d) {
    readdirSync(d, { withFileTypes: true }).forEach(function (entry) {
      var full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else map.set(relative(dir, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex'));
    });
  })(dir);
  return map;
}

function diff(a, b) {
  var out = [];
  a.forEach(function (v, k) {
    if (!b.has(k)) out.push('缺失 ' + k);
    else if (b.get(k) !== v) out.push('变更 ' + k);
  });
  b.forEach(function (v, k) { if (!a.has(k)) out.push('新增 ' + k); });
  return out.sort();
}

/* 收集活代码文件（种子 JSON + src 代码 + 入口 HTML），用于「退役件是否还有加载路径引用」核查 */
function collectLiveCodeFiles() {
  var files = [];
  [join(publicDir, 'assets', 'seed-data.json'), join(publicDir, 'yingge', 'assets', 'seed-data.json'),
    join(root, 'index.html'), join(root, 'yingge', 'index.html')].forEach(function (f) {
    if (existsSync(f)) files.push(f);
  });
  [join(root, 'src'), join(root, 'yingge', 'src')].forEach(function (dir) {
    (function walk(d) {
      if (!existsSync(d)) return;
      readdirSync(d, { withFileTypes: true }).forEach(function (entry) {
        var full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|mjs|css|html)$/i.test(entry.name)) files.push(full);
      });
    })(dir);
  });
  return files;
}

var LIVE_CODE_FILES = collectLiveCodeFiles();

/* 查某素材的活引用：strong = 「assets/<文件名>」加载路径（硬失败）；weak = 仅出现文件名（标签映射等，仅报告） */
function scanLiveReferences(relFile) {
  var base = relFile.split('/').pop();
  var strong = 'assets/' + base;
  var strongHits = [];
  var weakHits = [];
  LIVE_CODE_FILES.forEach(function (f) {
    var text;
    try { text = readFileSync(f, 'utf8'); } catch (e) { return; }
    var rel = relative(root, f).split(sep).join('/');
    if (text.indexOf(strong) >= 0 || (rel !== 'src/asset-badges.js' && text.indexOf(base) >= 0)) strongHits.push(rel);
    else if (text.indexOf(base) >= 0) weakHits.push(rel);
  });
  return { strong: strongHits, weak: weakHits };
}

var outArg = argValue('--out');
if (!outArg) {
  console.error('用法：node scripts/verify-build-assets.mjs --out <全新输出目录>');
  process.exit(2);
}

console.log('[verify] A 组（用户确认未展示，固定 ' + PUBLIC_BUILD_EXCLUDE_CONFIRMED.length + ' 件）：' + PUBLIC_BUILD_EXCLUDE_CONFIRMED.join('、'));
console.log('[verify] B 组（已退役、无加载路径引用，' + PUBLIC_BUILD_EXCLUDE_RETIRED.length + ' 件）：' + PUBLIC_BUILD_EXCLUDE_RETIRED.join('、'));

/* 核查项 3（构建前）：B 组退役件必须已无加载路径引用，否则直接失败、不建目录、不写任何东西 */
var retiredStrongHits = [];
PUBLIC_BUILD_EXCLUDE_RETIRED.forEach(function (rel) {
  var hits = scanLiveReferences(rel);
  if (hits.strong.length) retiredStrongHits.push(rel + ' → ' + hits.strong.join('、'));
});
if (retiredStrongHits.length) {
  console.error('[verify] 已拒绝构建：以下退役件仍存在加载路径引用（请先完成替换再扩排）：');
  retiredStrongHits.forEach(function (m) { console.error('  - ' + m); });
  process.exit(2);
}
PUBLIC_BUILD_EXCLUDE_RETIRED.forEach(function (rel) {
  var weak = scanLiveReferences(rel).weak;
  if (weak.length) console.log('[verify] 提示：退役件 ' + rel + ' 仍有仅按文件名出现的位置（非加载路径，仅标签映射）：' + weak.join('、'));
});

/* 安全守卫 + 原子创建全新输出目录；被拒绝时不做任何写入 */
var outDir;
try {
  outDir = createFreshOutDir({ outDir: outArg, root: root, publicDir: publicDir, distDir: distDir });
} catch (e) {
  console.error('[verify] 已拒绝构建：' + e.message);
  console.error('[verify] 未创建目录、未清空任何目录、未写入任何文件。');
  process.exit(2);
}
console.log('[verify] 全新输出目录（已原子创建）：' + outDir);

var publicBefore = manifest(publicDir);
var distBefore = manifest(distDir);
console.log('[verify] 构建前 public 文件数：' + publicBefore.size + '，dist 文件数：' + distBefore.size);

await build({
  root: root,
  configFile: join(root, 'vite.config.js'),
  build: { outDir: outDir, emptyOutDir: false },
});

var publicAfter = manifest(publicDir);
var distAfter = manifest(distDir);
var outFiles = manifest(outDir);

var failures = [];
function check(ok, label, detail) {
  if (ok) console.log('  [通过] ' + label);
  else {
    console.log('  [不通过] ' + label + (detail ? ' —— ' + detail : ''));
    failures.push(label);
  }
}

console.log('[verify] 核查项 1：排除件不得进入产物');
PUBLIC_BUILD_EXCLUDE.forEach(function (rel) {
  check(!outFiles.has(rel), '产物中不含 ' + rel + '（' + (PUBLIC_BUILD_EXCLUDE_CONFIRMED.indexOf(rel) >= 0 ? 'A 组' : 'B 组') + '）');
});
var excludedBase = PUBLIC_BUILD_EXCLUDE.map(function (p) { return p.split('/').pop().toLowerCase(); });
var leaked = [];
outFiles.forEach(function (v, k) {
  if (excludedBase.indexOf(k.split('/').pop().toLowerCase()) >= 0) leaked.push(k);
});
check(leaked.length === 0, '产物中不存在任何排除件同名文件', leaked.join('、'));

console.log('[verify] 核查项 2：正向对照（保留件必须齐备且字节一致）');
var missing = [];
var mismatched = [];
publicBefore.forEach(function (hash, rel) {
  if (PUBLIC_BUILD_EXCLUDE.indexOf(rel) >= 0) return;
  if (!outFiles.has(rel)) missing.push(rel);
  else if (outFiles.get(rel) !== hash) mismatched.push(rel);
});
check(missing.length === 0, 'public 中除排除项外的 ' + (publicBefore.size - PUBLIC_BUILD_EXCLUDE.length) + ' 件全部进入产物', missing.join('、'));
check(mismatched.length === 0, '产物中保留件与源文件逐字节一致', mismatched.join('、'));

var required = [
  'assets/gz-arcade.webp',
  'assets/gz-teahouse.webp', 'assets/cz-paifang.webp',
  'assets/opera.svg', 'assets/qilin.svg', 'assets/yulan.svg',
  'yingge/assets/yg-role.svg', 'yingge/assets/yg-team.svg', 'yingge/assets/yg-legacy.svg',
  'assets/home-provincial-map.svg', 'assets/favicon.svg', 'assets/seed-data.json',
  'assets/sticker-0.jpg', 'assets/sticker-8.jpg',
  'yingge/assets/seed-data.json', 'yingge/assets/yingge-hero.svg', 'yingge/assets/favicon.svg',
  'index.html', 'yingge/index.html',
];
required.forEach(function (rel) { check(outFiles.has(rel), '产物中含 ' + rel); });

console.log('[verify] 核查项 3：B 组退役件已无加载路径引用');
PUBLIC_BUILD_EXCLUDE_RETIRED.forEach(function (rel) {
  var hits = scanLiveReferences(rel);
  check(hits.strong.length === 0, '退役件 ' + rel + ' 无加载路径引用', hits.strong.join('、'));
});

console.log('[verify] 核查项 4：public 源目录未被改动（原件保留）');
var pubDiff = diff(publicBefore, publicAfter);
check(pubDiff.length === 0, 'public/ 构建前后无任何增删改', pubDiff.join('、'));

console.log('[verify] 核查项 5：原 dist/ 未被写入');
var distDiff = diff(distBefore, distAfter);
check(distDiff.length === 0, 'dist/ 构建前后无任何增删改', distDiff.join('、'));

console.log('[verify] 核查项 6：bundle 产物正常');
var hasJs = false, hasCss = false;
outFiles.forEach(function (v, k) {
  if (/\.js$/.test(k)) hasJs = true;
  if (/\.css$/.test(k)) hasCss = true;
});
check(hasJs, '产物含打包后的 js');
check(hasCss, '产物含打包后的 css');

console.log('[verify] 产物文件总数：' + outFiles.size + '（public ' + publicBefore.size + ' − 排除 ' + PUBLIC_BUILD_EXCLUDE.length + ' + bundle）');
if (failures.length) {
  console.error('[verify] 核查未通过，共 ' + failures.length + ' 项：');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('[verify] 全部核查通过。');
