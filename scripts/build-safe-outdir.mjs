/* 构建输出目录安全性守卫：确保构建产物只写进「全新目录」，绝不清空或删除既有内容。
   背景：Vite 的 build.emptyOutDir 会把已存在的输出目录整个清空。若把用户传入的路径直接交给
   Vite，空目录、临时目录、甚至误传的 public / dist 都会被清掉。本模块在构建前先做校验，
   不通过就直接失败（失败不写入、不清空、不删除），通过后用原子方式创建新目录，
   构建时以 emptyOutDir: false 运行。
   拒绝范围：
     - 已存在的输出目录（含空目录、临时目录）；
     - public 目录本身及其下任意嵌套目录；
     - 原 dist 目录本身及其下任意嵌套目录；
     - 工程根目录本身及其任意祖先目录；
     - 路径上存在符号链接 / junction，或真实位置与声明路径不一致（防链接重定向）。
   本模块只做校验与创建，不删除任何文件。 */
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';

/* 判断 child 是否位于 parent 之内（含相等）。跨盘符时 relative 返回绝对路径，判为「不在内」。 */
export function isInside(parent, child) {
  if (!parent || !child) return false;
  var rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/* 逐级检查路径上是否存在符号链接 / junction（Windows 的 junction 在 lstat 下同样 isSymbolicLink）。 */
export function findSymlinkComponent(path) {
  var abs = resolve(path);
  var parsed = parse(abs);
  var current = parsed.root;
  var segments = abs.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  for (var i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    var st;
    try {
      st = lstatSync(current);
    } catch (e) {
      return null; /* 该级不存在，后续级也不存在 */
    }
    if (st.isSymbolicLink()) return current;
  }
  return null;
}

/* 取「最近一个已存在祖先」的真实路径，用于识别链接重定向 */
function nearestExistingRealPath(abs) {
  var tail = [];
  var current = abs;
  while (!existsSync(current)) {
    var parent = dirname(current);
    if (parent === current) return null;
    tail.unshift(basename(current));
    current = parent;
  }
  var real;
  try {
    real = realpathSync(current);
  } catch (e) {
    return null;
  }
  return tail.length ? join(real, ...tail) : real;
}

function samePath(a, b) {
  var norm = function (p) {
    var s = resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? s.toLowerCase() : s;
  };
  return norm(a) === norm(b);
}

/* 构建前校验：任何一条不通过都抛错，绝不写入。返回解析后的绝对路径。 */
export function assertSafeOutDir(options) {
  var opts = options || {};
  if (!opts.outDir) throw new Error('[safe-outdir] 缺少 outDir 参数');
  var abs = resolve(opts.outDir);
  var root = opts.root ? resolve(opts.root) : null;
  var publicDir = opts.publicDir ? resolve(opts.publicDir) : null;
  var distDir = opts.distDir ? resolve(opts.distDir) : null;

  /* 1) 工程根及其祖先（先判危险区，报错更精确） */
  if (root && isInside(abs, root)) {
    throw new Error('[safe-outdir] 输出目录不得是工程根目录或其祖先目录：' + abs);
  }
  /* 2) public / dist 本身及其下嵌套目录 */
  if (publicDir && isInside(publicDir, abs)) {
    throw new Error('[safe-outdir] 输出目录不得位于 public 目录之内（含 public 本身）：' + abs);
  }
  if (distDir && isInside(distDir, abs)) {
    throw new Error('[safe-outdir] 输出目录不得位于 dist 目录之内（含 dist 本身）：' + abs);
  }
  /* 3) 已存在即拒绝（空目录、临时目录、残留产物都一样） */
  if (existsSync(abs)) {
    throw new Error('[safe-outdir] 输出目录已存在，必须是全新目录（不会清空、不会删除）：' + abs);
  }
  /* 4) 路径经过符号链接 / junction */
  var link = findSymlinkComponent(abs);
  if (link) {
    throw new Error('[safe-outdir] 输出路径经过符号链接 / junction，拒绝写入：' + link);
  }
  /* 5) 真实位置与声明位置不一致（防链接重定向） */
  var real = nearestExistingRealPath(abs);
  if (real && !samePath(real, abs)) {
    throw new Error('[safe-outdir] 输出路径的真实位置与声明不一致（疑似链接重定向），拒绝写入：' + abs + ' → ' + real);
  }
  return abs;
}

/* 校验通过后原子创建新目录：父级递归建，最终一级用非递归 mkdir（已存在即报错，绝不覆盖）。 */
export function createFreshOutDir(options) {
  var opts = options || {};
  var abs = assertSafeOutDir(opts);
  var parent = dirname(abs);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  try {
    mkdirSync(abs);
  } catch (e) {
    throw new Error('[safe-outdir] 原子创建输出目录失败（可能已被占用）：' + abs + ' —— ' + e.message);
  }
  return abs;
}
