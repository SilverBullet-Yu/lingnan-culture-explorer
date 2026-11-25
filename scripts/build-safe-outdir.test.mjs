/* 构建输出目录安全性守卫的单元测试（Node 内置 test runner，无额外依赖）。
   运行：node --test scripts/build-safe-outdir.test.mjs
   覆盖：已存在目录（含空目录）/ public / dist / 工程根及其祖先 / 符号链接与 junction 一律拒绝，
        且拒绝时不写入、不删除、不清空；全新目录以原子方式创建。
   所有负向用例都在自建临时目录内用哨兵文件自证「未被改动」，不触碰任何用户内容。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { assertSafeOutDir, createFreshOutDir, isInside, findSymlinkComponent } from './build-safe-outdir.mjs';

/* 自建假工程：root / public / dist，全部在临时目录内 */
function makeFakeProject() {
  var base = mkdtempSync(join(tmpdir(), 'lingnan-safedir-'));
  var root = join(base, 'root');
  mkdirSync(join(root, 'public', 'assets'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'public', 'assets', 'sentinel.txt'), 'public-sentinel');
  writeFileSync(join(root, 'dist', 'sentinel.txt'), 'dist-sentinel');
  writeFileSync(join(root, 'public-ancestor-sentinel.txt'), 'root-sentinel');
  return { base: base, root: root };
}

function guard(outDir, p) {
  return function () {
    assertSafeOutDir({ outDir: outDir, root: p.root, publicDir: join(p.root, 'public'), distDir: join(p.root, 'dist') });
  };
}

test('isInside 判定目录包含关系（含相等）', function () {
  assert.equal(isInside('D:/proj', 'D:/proj/sub'), true);
  assert.equal(isInside('D:/proj', 'D:/proj'), true);
  assert.equal(isInside('D:/proj', 'D:/other'), false);
  assert.equal(isInside('D:/proj', 'D:/proj-sibling'), false);
});

test('已存在目录（含空目录）一律拒绝，且内容保持不变', function () {
  var p = makeFakeProject();
  try {
    var existing = join(p.base, 'existing');
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, 'sentinel.txt'), 'keep-me');
    assert.throws(guard(existing, p), /全新目录|已存在/);
    /* 拒绝后不得有任何改动 */
    assert.equal(readFileSync(join(existing, 'sentinel.txt'), 'utf8'), 'keep-me');

    var emptyDir = join(p.base, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    assert.throws(guard(emptyDir, p), /全新目录|已存在/);
    assert.equal(existsSync(join(emptyDir, 'sentinel.txt')), false);
  } finally {
    rmSync(p.base, { recursive: true, force: true });
  }
});

test('public / dist 本身及其下嵌套目录一律拒绝，且哨兵保持不变', function () {
  var p = makeFakeProject();
  try {
    assert.throws(guard(join(p.root, 'public'), p), /public/);
    assert.throws(guard(join(p.root, 'public', 'assets'), p), /public/);
    assert.throws(guard(join(p.root, 'public', 'assets', 'new'), p), /public/);
    assert.throws(guard(join(p.root, 'dist'), p), /dist/);
    assert.throws(guard(join(p.root, 'dist', 'nested'), p), /dist/);
    assert.equal(readFileSync(join(p.root, 'public', 'assets', 'sentinel.txt'), 'utf8'), 'public-sentinel');
    assert.equal(readFileSync(join(p.root, 'dist', 'sentinel.txt'), 'utf8'), 'dist-sentinel');
  } finally {
    rmSync(p.base, { recursive: true, force: true });
  }
});

test('工程根及其祖先目录一律拒绝，且哨兵保持不变', function () {
  var p = makeFakeProject();
  try {
    assert.throws(guard(p.root, p), /工程根|祖先/);
    assert.throws(guard(p.base, p), /工程根|祖先/);
    assert.equal(readFileSync(join(p.root, 'public-ancestor-sentinel.txt'), 'utf8'), 'root-sentinel');
  } finally {
    rmSync(p.base, { recursive: true, force: true });
  }
});

test('经过符号链接 / junction 的路径一律拒绝，且目标目录哨兵保持不变', function () {
  var p = makeFakeProject();
  var link = join(p.base, 'link-to-public');
  try {
    var created = true;
    try {
      symlinkSync(join(p.root, 'public'), link, 'junction');
    } catch (e) {
      created = false;
    }
    if (!created) {
      /* 环境不允许创建 junction：只验证查找函数对不存在组件的处理 */
      assert.equal(findSymlinkComponent(join(p.base, 'not-exist', 'x')), null);
      return;
    }
    assert.equal(findSymlinkComponent(link), link);
    assert.throws(guard(join(link, 'nested'), p), /符号链接|junction|真实位置/);
    assert.throws(guard(link, p), /全新目录|已存在|符号链接|junction/);
    assert.equal(readFileSync(join(p.root, 'public', 'assets', 'sentinel.txt'), 'utf8'), 'public-sentinel');
  } finally {
    try { unlinkSync(link); } catch (e) { try { rmdirSync(link); } catch (e2) { /* 忽略 */ } }
    rmSync(p.base, { recursive: true, force: true });
  }
});

test('全新目录通过校验，并以原子方式创建（已存在则报错且不删内容）', function () {
  var p = makeFakeProject();
  try {
    var fresh = join(p.base, 'fresh-out');
    var resolved = assertSafeOutDir({ outDir: fresh, root: p.root, publicDir: join(p.root, 'public'), distDir: join(p.root, 'dist') });
    assert.equal(resolved, resolve(fresh));
    assert.equal(existsSync(fresh), false, '校验阶段不得创建任何目录');

    var created = createFreshOutDir({ outDir: fresh, root: p.root, publicDir: join(p.root, 'public'), distDir: join(p.root, 'dist') });
    assert.equal(created, resolve(fresh));
    assert.equal(existsSync(fresh), true);

    /* 再次创建必须失败，且不得清空既有内容 */
    writeFileSync(join(fresh, 'sentinel.txt'), 'keep-me');
    assert.throws(function () {
      createFreshOutDir({ outDir: fresh, root: p.root, publicDir: join(p.root, 'public'), distDir: join(p.root, 'dist') });
    }, /全新目录|已存在|原子创建/);
    assert.equal(readFileSync(join(fresh, 'sentinel.txt'), 'utf8'), 'keep-me');
  } finally {
    rmSync(p.base, { recursive: true, force: true });
  }
});

test('相对 outDir 按当前工作目录解析为绝对路径后参与校验', function () {
  var p = makeFakeProject();
  try {
    var rel = 'rel-out-' + Date.now();
    var resolved = assertSafeOutDir({ outDir: rel, root: p.root, publicDir: join(p.root, 'public'), distDir: join(p.root, 'dist') });
    assert.equal(resolved, resolve(rel));
    assert.equal(dirname(resolved), resolve('.'));
  } finally {
    rmSync(p.base, { recursive: true, force: true });
  }
});
