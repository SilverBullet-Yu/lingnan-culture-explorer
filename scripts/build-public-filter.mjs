/* 构建期 public 复制过滤：把 public/ 复制进构建产物，但精确排除若干不随新版静态分发的素材。
   背景：用户确认未展示的 6 张图片不进入新版分发，原件仍保留在 public/ 内（不移动、不改名、不删除）。
   做法：vite.config.js 里置 build.copyPublicDir = false，改由本插件做一次受限复制，
        时机与 Vite 默认行为一致（renderStart，位于 outDir 清理之后、bundle 产物写出之前）。
   扩展：需再排除旧件时，只在 PUBLIC_BUILD_EXCLUDE 里追加一行「相对 public/ 根的 POSIX 路径」即可。 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/* —— 两组排除清单（互不影响；A 组是回归基线，B 组可逐件扩充）——
   A 组 PUBLIC_BUILD_EXCLUDE_CONFIRMED：用户确认未展示的 6 件，固定不变。
     任何扩排都不得改动这一组，单元测试对本组做逐项断言。
   B 组 PUBLIC_BUILD_EXCLUDE_RETIRED：已完成替换、且确认已无加载路径引用的退役照片，精确路径、逐件新增。
   匹配语义：相对 public/ 根的精确路径（POSIX 分隔符）；大小写不敏感（Windows 文件系统本身不区分大小写）。

   —— 退役件扩排流程（等所有新图就绪后逐件做，不要批量提前排）——
     1) 先确认替换图已就位且该旧图已无加载路径引用：在 public/assets/seed-data.json、
        public/yingge/assets/seed-data.json、src/**、yingge/src/** 里查「assets/<文件名>」形式的引用。
        （src/asset-badges.js 里按文件名登记的角标映射属标签映射、不是加载路径，可暂留待 Chief 清理。）
     2) 把该旧图的相对路径追加到 PUBLIC_BUILD_EXCLUDE_RETIRED（A 组不要动）。
     3) 跑 node --test scripts/build-public-filter.test.mjs：A 组 6 件回归必须仍然全绿。
     4) 跑 node scripts/verify-build-assets.mjs --out <全新目录>：脚本会核对退役件无加载路径引用、
        排除件确实不在产物、正控件齐备、public/ 与 dist/ 零改动。
     5) 输出目录必须是全新目录：复用旧目录会被安全守卫拒绝（不清空、不删除）。
   —— 退役件追加时的前置检查——
     只加「已完成替换且确认无引用」的件；仍在用的旧图（chaozhou-paifang.jpg、guangzhou-teahouse.jpg 等）
     一律留在 public/ 里照常分发。 */

/* A 组：用户确认未展示、从新版静态分发排除的 6 件（原件保留在 public/ 内，构建期只是不复制、不删除）。 */
export var PUBLIC_BUILD_EXCLUDE_CONFIRMED = [
  'assets/guangzhou-dimsum.jpg',
  'assets/guangzhou-service.jpg',
  'assets/foshan-fish-market.jpg',
  'assets/foshan-market.jpg',
  'assets/hongkong-fire-dragon.jpeg',
  'assets/macao-museum.jpg',
];

/* B 组：已完成替换且确认无引用的退役照片（精确路径，可逐件新增）。 */
export var PUBLIC_BUILD_EXCLUDE_RETIRED = [
  'assets/guangzhou-qilou.jpg',
  'assets/guangzhou-teahouse.jpg',
  'assets/chaozhou-paifang.jpg',
  'assets/yueju-stage.jpg',
  'assets/hakka-unicorn.jpeg',
  'assets/teochew-festival.jpeg',
];

/* 合并两组：A 组在前、B 组在后；任一组为空不影响另一组。 */
export function combineExcludeLists(confirmed, retired) {
  return (confirmed || []).concat(retired || []);
}

/* 构建期实际生效的合并清单。 */
export var PUBLIC_BUILD_EXCLUDE = combineExcludeLists(PUBLIC_BUILD_EXCLUDE_CONFIRMED, PUBLIC_BUILD_EXCLUDE_RETIRED);

/* 把任意写法的相对路径归一化为「相对 public/ 根的 POSIX 路径」 */
export function normalizeRelPath(p) {
  var s = String(p == null ? '' : p).replace(/\\/g, '/');
  while (s.indexOf('./') === 0) s = s.slice(2);
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  s = s.replace(/\/{2,}/g, '/');
  return s;
}

/* 精确路径匹配：只排除清单里列出的那一个文件，不误伤同前缀 / 同目录其他文件 */
export function isExcluded(relPath, excludeList) {
  var target = normalizeRelPath(relPath).toLowerCase();
  return (excludeList || []).some(function (item) {
    return normalizeRelPath(item).toLowerCase() === target;
  });
}

/* 递归列出 public 下的全部文件（相对 public/ 根的 POSIX 路径，排序后返回） */
export function collectPublicFiles(publicDir) {
  var out = [];
  function walk(dir, base) {
    var entries = readdirSync(dir, { withFileTypes: true });
    entries.forEach(function (entry) {
      var full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else out.push(relative(base, full).split(sep).join('/'));
    });
  }
  walk(publicDir, publicDir);
  return out.sort();
}

/* 受限复制：public/ → outDir/，跳过排除清单中的文件。
   只读源目录、只写产物目录；源文件不会被移动或删除。返回 { copied, skipped }。 */
export function copyPublicWithFilter(options) {
  var opts = options || {};
  var publicDir = opts.publicDir;
  var outDir = opts.outDir;
  var exclude = opts.exclude || [];
  if (!publicDir || !outDir) throw new Error('[public-filter] 缺少 publicDir 或 outDir');
  if (!existsSync(publicDir)) throw new Error('[public-filter] public 目录不存在：' + publicDir);

  var copied = 0;
  var skipped = [];
  collectPublicFiles(publicDir).forEach(function (rel) {
    if (isExcluded(rel, exclude)) {
      skipped.push(rel);
      return;
    }
    var dest = join(outDir, rel.split('/').join(sep));
    mkdirSync(join(dest, '..'), { recursive: true });
    copyFileSync(join(publicDir, rel.split('/').join(sep)), dest);
    copied += 1;
  });
  return { copied: copied, skipped: skipped };
}

/* Vite 把 build.outDir 保留为相对路径（相对工程根），这里按 Vite 语义解析：
   相对路径按 root 解析，绝对路径原样保留。 */
export function resolveOutDir(root, outDir) {
  var base = root || process.cwd();
  if (!outDir) return resolve(base, 'dist');
  return isAbsolute(outDir) ? outDir : resolve(base, outDir);
}

/* Vite 插件：替代 Vite 默认的全量 public 复制（build.copyPublicDir = false 时启用）。 */
export function createPublicCopyFilterPlugin(options) {
  var opts = options || {};
  /* 三种传法：显式 exclude / 两组分开传 / 都不传（用默认合并清单） */
  var exclude = opts.exclude
    || (opts.excludeConfirmed || opts.excludeRetired
      ? combineExcludeLists(opts.excludeConfirmed, opts.excludeRetired)
      : PUBLIC_BUILD_EXCLUDE);
  var publicDir = null;
  var outDir = null;
  var write = true;
  var root = null;
  var logger = null;

  return {
    name: 'lingnan:public-copy-filter',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
      write = config.build.write !== false;
      root = config.root;
      logger = config.logger || null;
      outDir = resolveOutDir(root, config.build.outDir);
    },
    renderStart: {
      /* post：排在 vite:prepare-out-dir（renderStart pre，清空 outDir）之后，避免产物被清掉 */
      order: 'post',
      handler() {
        if (!write || !publicDir || !outDir) return;
        var result = copyPublicWithFilter({ publicDir: publicDir, outDir: outDir, exclude: exclude });
        var msg = '[public-filter] public 受限复制完成：复制 ' + result.copied + ' 件' +
          (result.skipped.length ? '，排除 ' + result.skipped.length + ' 件：' + result.skipped.join('、') : '，无排除项');
        if (logger && typeof logger.info === 'function') logger.info(msg);
        else console.log(msg);
      },
    },
  };
}
