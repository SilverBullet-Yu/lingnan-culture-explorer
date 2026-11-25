/* 构建期 public 复制过滤的单元测试（Node 内置 test runner，无额外依赖）。
   运行：node --test scripts/build-public-filter.test.mjs
   覆盖：两组排除清单（A 组固定 6 件 / B 组退役件）、路径归一化、精确匹配语义、
        复制过滤行为、源目录只读性。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  PUBLIC_BUILD_EXCLUDE,
  PUBLIC_BUILD_EXCLUDE_CONFIRMED,
  PUBLIC_BUILD_EXCLUDE_RETIRED,
  combineExcludeLists,
  normalizeRelPath,
  isExcluded,
  collectPublicFiles,
  copyPublicWithFilter,
  createPublicCopyFilterPlugin,
  resolveOutDir,
} from './build-public-filter.mjs';

/* A 组：用户确认未展示、必须排除的固定 6 件（原件仍保留在 public/ 内） */
var EXPECTED_CONFIRMED = [
  'assets/guangzhou-dimsum.jpg',
  'assets/guangzhou-service.jpg',
  'assets/foshan-fish-market.jpg',
  'assets/foshan-market.jpg',
  'assets/hongkong-fire-dragon.jpeg',
  'assets/macao-museum.jpg',
];

/* B 组：已完成替换且确认无引用的退役照片（可逐件新增） */
var EXPECTED_RETIRED = [
  'assets/guangzhou-qilou.jpg',
  'assets/guangzhou-teahouse.jpg',
  'assets/chaozhou-paifang.jpg',
  'assets/yueju-stage.jpg',
  'assets/hakka-unicorn.jpeg',
  'assets/teochew-festival.jpeg',
];

test('A 组固定 6 件：内容与顺序稳定，任何扩排都不得影响这一组', function () {
  assert.deepEqual([...PUBLIC_BUILD_EXCLUDE_CONFIRMED], EXPECTED_CONFIRMED);
  PUBLIC_BUILD_EXCLUDE_CONFIRMED.forEach(function (p) {
    assert.equal(normalizeRelPath(p), p, '排除项须已是归一化相对路径：' + p);
    assert.ok(p.startsWith('assets/'), '排除项须限定在 assets/ 内：' + p);
  });
});

test('B 组退役件：独立成组、精确路径、可逐件新增', function () {
  assert.deepEqual([...PUBLIC_BUILD_EXCLUDE_RETIRED], EXPECTED_RETIRED);
  PUBLIC_BUILD_EXCLUDE_RETIRED.forEach(function (p) {
    assert.equal(normalizeRelPath(p), p, '退役项须已是归一化相对路径：' + p);
    assert.ok(p.startsWith('assets/'), '退役项须限定在 assets/ 内：' + p);
  });
});

test('B 组新增不影响 A 组：A 组内容与顺序保持不变', function () {
  var extended = combineExcludeLists(PUBLIC_BUILD_EXCLUDE_CONFIRMED, PUBLIC_BUILD_EXCLUDE_RETIRED.concat(['assets/another-retired.jpg']));
  assert.deepEqual([...PUBLIC_BUILD_EXCLUDE_CONFIRMED], EXPECTED_CONFIRMED, 'A 组内容必须原样保留');
  assert.deepEqual(extended.slice(0, PUBLIC_BUILD_EXCLUDE_CONFIRMED.length), [...PUBLIC_BUILD_EXCLUDE_CONFIRMED], 'A 组必须排在合并清单前段且不被改写');
  assert.ok(extended.indexOf('assets/another-retired.jpg') >= 0);
  assert.equal(extended.length, PUBLIC_BUILD_EXCLUDE_CONFIRMED.length + PUBLIC_BUILD_EXCLUDE_RETIRED.length + 1);
});

test('合并清单 = A 组 + B 组，无重复项', function () {
  assert.deepEqual([...PUBLIC_BUILD_EXCLUDE], combineExcludeLists(PUBLIC_BUILD_EXCLUDE_CONFIRMED, PUBLIC_BUILD_EXCLUDE_RETIRED));
  var seen = new Set();
  PUBLIC_BUILD_EXCLUDE.forEach(function (p) {
    assert.equal(seen.has(p), false, '排除清单出现重复项：' + p);
    seen.add(p);
  });
});

test('normalizeRelPath 统一为 POSIX 相对路径', function () {
  assert.equal(normalizeRelPath('assets\\a.jpg'), 'assets/a.jpg');
  assert.equal(normalizeRelPath('./assets/a.jpg'), 'assets/a.jpg');
  assert.equal(normalizeRelPath('/assets/a.jpg'), 'assets/a.jpg');
  assert.equal(normalizeRelPath('assets/a.jpg'), 'assets/a.jpg');
});

test('isExcluded 只做精确路径匹配，不误伤同前缀文件', function () {
  assert.equal(isExcluded('assets/guangzhou-dimsum.jpg', PUBLIC_BUILD_EXCLUDE), true);
  assert.equal(isExcluded('assets/guangzhou-dimsum.jpg.bak', PUBLIC_BUILD_EXCLUDE), false);
  assert.equal(isExcluded('assets/guangzhou-dimsum-old.jpg', PUBLIC_BUILD_EXCLUDE), false);
  assert.equal(isExcluded('assets/sub/guangzhou-dimsum.jpg', PUBLIC_BUILD_EXCLUDE), false);
  assert.equal(isExcluded('assets/guangzhou-qilou.jpg', PUBLIC_BUILD_EXCLUDE), true, '已退役件须被排除');
  assert.equal(isExcluded('assets/guangzhou-qilou.jpg', PUBLIC_BUILD_EXCLUDE_CONFIRMED), false, '退役件不属于 A 组');
  assert.equal(isExcluded('assets/gz-arcade.webp', PUBLIC_BUILD_EXCLUDE), false, '新版图不得被排除');
});

test('collectPublicFiles 递归列出 public 下的全部相对路径', function () {
  var base = mkdtempSync(join(tmpdir(), 'lingnan-publicfilter-list-'));
  try {
    mkdirSync(join(base, 'assets', 'audio'), { recursive: true });
    writeFileSync(join(base, 'assets', 'a.jpg'), 'x');
    writeFileSync(join(base, 'assets', 'audio', 'b.wav'), 'y');
    var files = collectPublicFiles(base);
    assert.deepEqual(files.sort(), ['assets/a.jpg', 'assets/audio/b.wav']);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('copyPublicWithFilter 复制保留项、跳过 A 组与 B 组，且源文件原样不动', function () {
  var base = mkdtempSync(join(tmpdir(), 'lingnan-publicfilter-copy-'));
  try {
    var src = join(base, 'public');
    var out = join(base, 'out');
    mkdirSync(join(src, 'assets', 'audio'), { recursive: true });
    mkdirSync(join(src, 'yingge', 'assets'), { recursive: true });
    writeFileSync(join(src, 'assets', 'gz-arcade.webp'), 'keep-bytes');
    writeFileSync(join(src, 'assets', 'guangzhou-dimsum.jpg'), 'drop-a');
    writeFileSync(join(src, 'assets', 'guangzhou-qilou.jpg'), 'drop-b');
    writeFileSync(join(src, 'assets', 'seed-data.json'), '{"a":1}');
    writeFileSync(join(src, 'assets', 'audio', 'ambient-tea.wav'), 'wav-bytes');
    writeFileSync(join(src, 'yingge', 'assets', 'yingge-hero.svg'), '<svg/>');

    var result = copyPublicWithFilter({ publicDir: src, outDir: out, exclude: PUBLIC_BUILD_EXCLUDE });

    /* A 组与 B 组都不进产物 */
    assert.equal(existsSync(join(out, 'assets', 'guangzhou-dimsum.jpg')), false);
    assert.equal(existsSync(join(out, 'assets', 'guangzhou-qilou.jpg')), false);
    /* 保留项进产物且字节一致 */
    assert.equal(readFileSync(join(out, 'assets', 'gz-arcade.webp'), 'utf8'), 'keep-bytes');
    assert.equal(readFileSync(join(out, 'assets', 'seed-data.json'), 'utf8'), '{"a":1}');
    assert.equal(readFileSync(join(out, 'assets', 'audio', 'ambient-tea.wav'), 'utf8'), 'wav-bytes');
    assert.equal(readFileSync(join(out, 'yingge', 'assets', 'yingge-hero.svg'), 'utf8'), '<svg/>');
    /* 计数与跳过清单准确 */
    assert.equal(result.copied, 4);
    assert.deepEqual(result.skipped, ['assets/guangzhou-dimsum.jpg', 'assets/guangzhou-qilou.jpg']);
    /* 源目录只读：被排除的原件仍在原地、内容未变 */
    assert.equal(readFileSync(join(src, 'assets', 'guangzhou-dimsum.jpg'), 'utf8'), 'drop-a');
    assert.equal(readFileSync(join(src, 'assets', 'guangzhou-qilou.jpg'), 'utf8'), 'drop-b');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('copyPublicWithFilter 排除清单为空时全量复制（等价 Vite 默认行为）', function () {
  var base = mkdtempSync(join(tmpdir(), 'lingnan-publicfilter-all-'));
  try {
    var src = join(base, 'public');
    var out = join(base, 'out');
    mkdirSync(join(src, 'assets'), { recursive: true });
    writeFileSync(join(src, 'assets', 'guangzhou-dimsum.jpg'), 'x');
    writeFileSync(join(src, 'assets', 'other.jpg'), 'y');
    var result = copyPublicWithFilter({ publicDir: src, outDir: out, exclude: [] });
    assert.equal(result.copied, 2);
    assert.deepEqual(result.skipped, []);
    assert.equal(existsSync(join(out, 'assets', 'guangzhou-dimsum.jpg')), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('resolveOutDir：相对 outDir 按工程根解析，绝对路径原样保留', function () {
  assert.equal(resolveOutDir('D:/proj', 'dist'), resolve('D:/proj', 'dist'));
  assert.equal(resolveOutDir('D:/proj', 'out/verify'), resolve('D:/proj', 'out/verify'));
  assert.equal(resolveOutDir('D:/proj', 'D:/abs/out'), 'D:/abs/out');
  assert.equal(resolveOutDir('D:/proj', undefined), resolve('D:/proj', 'dist'));
});

test('插件端到端：configResolved 解析相对 outDir 后，按两组清单完成受限复制', function () {
  var base = mkdtempSync(join(tmpdir(), 'lingnan-publicfilter-plugin-'));
  try {
    var src = join(base, 'public');
    mkdirSync(join(src, 'assets'), { recursive: true });
    writeFileSync(join(src, 'assets', 'gz-arcade.webp'), 'keep');
    writeFileSync(join(src, 'assets', 'guangzhou-dimsum.jpg'), 'drop-a');
    writeFileSync(join(src, 'assets', 'guangzhou-qilou.jpg'), 'drop-b');

    var plugin = createPublicCopyFilterPlugin({ exclude: PUBLIC_BUILD_EXCLUDE });
    plugin.configResolved({
      root: base,
      publicDir: src,
      build: { outDir: 'dist', write: true },
      logger: null,
    });
    plugin.renderStart.handler();

    assert.equal(existsSync(join(base, 'dist', 'assets', 'gz-arcade.webp')), true);
    assert.equal(existsSync(join(base, 'dist', 'assets', 'guangzhou-dimsum.jpg')), false);
    assert.equal(existsSync(join(base, 'dist', 'assets', 'guangzhou-qilou.jpg')), false);
    assert.equal(existsSync(join(src, 'assets', 'guangzhou-qilou.jpg')), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('插件形态：只作用于 build，复制发生在 outDir 清理之后', function () {
  var plugin = createPublicCopyFilterPlugin({ exclude: PUBLIC_BUILD_EXCLUDE });
  assert.equal(plugin.name, 'lingnan:public-copy-filter');
  assert.equal(plugin.apply, 'build');
  assert.equal(typeof plugin.configResolved, 'function');
  assert.equal(plugin.renderStart.order, 'post');
  assert.equal(typeof plugin.renderStart.handler, 'function');
});
