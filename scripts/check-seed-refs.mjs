/* 构建期种子数据引用自查（见 README「内容范围与原型边界」：漂移零容错）：
   读取 public/assets/seed-data.json，校验 regions/routes/scenes/phrases/tasks/qa 之间的
   引用完整性、必填字段、内容量与音频文件；任何一条不满足就逐条打印中文错误并以 exit 1 退出。
   数据形态：顶层 {version,theme,regions[],routes[],scenes[],phrases[],tasks[],qa[]}。 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

var here = dirname(fileURLToPath(import.meta.url));
var root = join(here, '..');
var errors = [];

var d;
try {
  d = JSON.parse(readFileSync(join(root, 'public', 'assets', 'seed-data.json'), 'utf8'));
} catch (e) {
  console.error('[check-seed] 读取或解析 public/assets/seed-data.json 失败：' + e.message);
  process.exit(1);
}
if (!d || typeof d !== 'object' || Array.isArray(d)) {
  console.error('[check-seed] seed-data.json 顶层必须是对象（{version,theme,regions,routes,scenes,phrases,tasks,qa}）');
  process.exit(1);
}

function nonEmpty(v) { return typeof v === 'string' && v.replace(/^\s+|\s+$/g, '') !== ''; }
function isHttp(v) { return typeof v === 'string' && /^https?:\/\//.test(v); }
function checkAsset(url, label) {
  if (!nonEmpty(url)) return;
  if (!/^(assets\/|yingge\/assets\/|https?:\/\/)/.test(url)) { errors.push(label + ' 需以 assets/、yingge/assets/ 或 http(s):// 开头：' + JSON.stringify(url)); return; }
  if (/^(assets\/|yingge\/assets\/)/.test(url) && !existsSync(join(root, 'public', url))) errors.push(label + ' 指向的本地文件不存在：' + JSON.stringify(url));
}
function checkCover(obj, label) {
  var img = obj.cover_image;
  if (!nonEmpty(img)) { errors.push(label + '.cover_image 为空或缺失（封面不允许占位）'); return; }
  checkAsset(img, label + '.cover_image');
  if (!nonEmpty(obj.cover_caption)) errors.push(label + '.cover_caption 为空或缺失');
  if (!nonEmpty(obj.source_url)) errors.push(label + '.source_url 为空或缺失');
}

function collectIds(list, name) {
  var seen = {}, dup = {}, out = {};
  (list || []).forEach(function (x) {
    if (!x || !nonEmpty(x.id)) return;
    if (seen[x.id] && !dup[x.id]) { errors.push(name + ' 存在重复 id：' + JSON.stringify(x.id)); dup[x.id] = true; }
    seen[x.id] = true; out[x.id] = true;
  });
  return out;
}

var TOPIC_KEYS = { food: true, nature: true, architecture: true, folk: true, dialect: true, craft: true, history: true };
var TASK_TYPES = { listening: true, choice: true, matching: true, relation: true, route: true };
var AUDIO_STATUS = { none: true, provided: true };
var AUDIO_SOURCE = { synthetic: true, human: true, spliced: true };
var REGION_STATUS = { open: true, planned: true };

/* id 集合 */
var regionIds = collectIds(d.regions, 'regions');
var sceneIds = collectIds(d.scenes, 'scenes');
var phraseIds = collectIds(d.phrases, 'phrases');
collectIds(d.tasks, 'tasks');
collectIds(d.qa, 'qa');

/* theme */
if (!d.theme || !nonEmpty(d.theme.id) || !nonEmpty(d.theme.name)) errors.push('theme.id / theme.name 为空或缺失');

/* regions */
(d.regions || []).forEach(function (r, i) {
  var label = 'regions[' + i + '](' + (r && r.id ? r.id : '缺 id') + ')';
  if (!r || !nonEmpty(r.id)) { errors.push('regions[' + i + '] 缺少 id'); return; }
  if (!REGION_STATUS[r.status]) errors.push(label + '.status 取值非法：' + JSON.stringify(r.status) + '（只允许 open/planned）');
  /* 封面三件套仅强制已开放地区；未开放地区页是纯简介，可无封面（梅州筹备中暂无授权图片） */
  if (r.status === 'open') checkCover(r, label);
  else if (r.cover_image) checkAsset(r.cover_image, label + '.cover_image');
});

/* 内容边界护栏（MVP V1.0）：广州与潮汕开放；佛山、梅州、中国香港、中国澳门保留简介但不可进入。 */
var OPEN_EXPECTED = ['region-cz', 'region-gz'];
var PLANNED_EXPECTED = ['region-fs', 'region-mz', 'region-hk', 'region-mo'];
var openActual = (d.regions || []).filter(function (r) { return r && r.status === 'open'; }).map(function (r) { return r.id; }).sort();
var plannedActual = (d.regions || []).filter(function (r) { return r && r.status === 'planned'; }).map(function (r) { return r.id; }).sort();
function sameList(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
if (!sameList(openActual, OPEN_EXPECTED.slice().sort())) errors.push('内容边界护栏：已开放地区应为 ' + OPEN_EXPECTED.join(', ') + '，实际 ' + (openActual.join(', ') || '（无）'));
if (!sameList(plannedActual, PLANNED_EXPECTED.slice().sort())) errors.push('内容边界护栏：未开放地区应为 ' + PLANNED_EXPECTED.join(', ') + '，实际 ' + (plannedActual.join(', ') || '（无）'));

/* routes：数组、3 场景/路线、场景不跨路线、next_route_id 真实存在 */
if (!Array.isArray(d.routes) || !d.routes.length) {
  errors.push('routes 缺失或为空（应是路线数组）');
} else {
  var routeIds = collectIds(d.routes, 'routes');
  var sceneOwner = {};
  d.routes.forEach(function (r, i) {
    var label = 'routes[' + i + '](' + (r && r.id ? r.id : '缺 id') + ')';
    if (!r || !nonEmpty(r.id)) { errors.push('routes[' + i + '] 缺少 id'); return; }
    if (!nonEmpty(r.name)) errors.push(label + '.name 为空或缺失');
    if (!nonEmpty(r.description)) errors.push(label + '.description 为空或缺失');
    if (!TOPIC_KEYS[r.theme_key]) errors.push(label + '.theme_key 取值非法：' + JSON.stringify(r.theme_key));
    if (!Array.isArray(r.region_ids) || !r.region_ids.length) errors.push(label + '.region_ids 为空或缺失');
    (r.region_ids || []).forEach(function (id) { if (!regionIds[id]) errors.push(label + '.region_ids 引用了不存在的区域：' + JSON.stringify(id)); });
    if (!(typeof r.estimated_minutes === 'number' && r.estimated_minutes > 0)) errors.push(label + '.estimated_minutes 必须是正数');
    if (!nonEmpty(r.completion_rule)) errors.push(label + '.completion_rule 为空或缺失');
    if (r.next_route_id !== null && r.next_route_id !== undefined) {
      if (!routeIds[r.next_route_id]) errors.push(label + '.next_route_id 引用了不存在的路线：' + JSON.stringify(r.next_route_id));
      if (r.next_route_id === r.id) errors.push(label + '.next_route_id 不能指向自己');
    }
    checkCover(r, label);
    var sids = Array.isArray(r.scene_ids) ? r.scene_ids : [];
    if (sids.length !== 3) errors.push(label + '.scene_ids 应为 3 个场景，实际 ' + sids.length + ' 个');
    var seen = {};
    sids.forEach(function (id) {
      if (seen[id]) errors.push(label + '.scene_ids 存在重复场景：' + JSON.stringify(id));
      seen[id] = true;
      if (!sceneIds[id]) errors.push(label + '.scene_ids 引用了不存在的场景：' + JSON.stringify(id));
      else if (sceneOwner[id]) errors.push('场景 ' + JSON.stringify(id) + ' 同时属于多条路线：' + sceneOwner[id] + ' / ' + r.id);
      else sceneOwner[id] = r.id;
    });
  });
  /* 每个场景都必须在一条路线里 */
  (d.scenes || []).forEach(function (s) {
    if (s && s.id && !sceneOwner[s.id]) errors.push('场景 ' + JSON.stringify(s.id) + ' 不属于任何路线');
  });
  if (d.routes.length < 2) errors.push('MVP 需要 2 条路线，当前只有 ' + d.routes.length + ' 条');
}

/* 旁白待补录场景：潮汕三场景原 audio_url 复用了广州旧场景旁白（2026-11 审计置空）；
   广州「街区变迁」为 2026-11-18 由「戏台粤剧」改造而来，旧粤剧旁白内容不符故置空。
   补录真实旁白后，将 audio_url 填回并从本豁免表删除对应 id。 */
var SCENE_AUDIO_EXEMPT = {
  'scene-cz-yingge-role': '旁白待补录（原复用广州早茶旁白）',
  'scene-cz-yingge-team': '旁白待补录（原复用广州骑楼旁白）',
  'scene-cz-yingge-legacy': '旁白待补录（原复用广州粤剧旁白）',
  'scene-gz-street': '旁白待补录（场景由戏台粤剧改造为街区变迁，旧粤剧旁白内容不符）'
};

/* scenes */
(d.scenes || []).forEach(function (s, i) {
  var label = 'scenes[' + i + '](' + (s && s.id ? s.id : '缺 id') + ')';
  if (!s || !nonEmpty(s.id)) { errors.push('scenes[' + i + '] 缺少 id'); return; }
  if (!regionIds[s.region_id]) errors.push(label + '.region_id 引用了不存在的区域：' + JSON.stringify(s.region_id));
  if (!phraseIds[s.phrase_id]) errors.push(label + '.phrase_id 引用了不存在的表达：' + JSON.stringify(s.phrase_id));
  if (!TOPIC_KEYS[s.topic]) errors.push(label + '.topic 取值非法：' + JSON.stringify(s.topic));
  checkCover(s, label);
  var n = s.narrative || {};
  ['story', 'place', 'people', 'objects', 'audio_note', 'ambient_note', 'source_note'].forEach(function (k) {
    if (!nonEmpty(n[k])) errors.push(label + '.narrative.' + k + ' 为空或缺失');
  });
  if (n.review_status !== 'reviewed' && n.review_status !== 'pending_review') errors.push(label + '.narrative.review_status 取值非法：' + JSON.stringify(n.review_status));
  ['audio_url', 'ambient_url'].forEach(function (k) {
    if (k === 'audio_url' && SCENE_AUDIO_EXEMPT[s.id]) return;
    if (!nonEmpty(n[k])) errors.push(label + '.narrative.' + k + ' 为空或缺失（MVP 要求每场景旁白与环境声，见 README「内容范围与原型边界」）');
    else checkAsset(n[k], label + '.narrative.' + k);
  });
  if (!AUDIO_SOURCE[n.audio_source]) errors.push(label + '.narrative.audio_source 取值非法：' + JSON.stringify(n.audio_source));
  if (n.audio_source === 'synthetic' && !(nonEmpty(n.audio_label) && n.audio_label.indexOf('非真人') >= 0)) {
    errors.push(label + '.narrative.audio_label 合成语音必须标注「非真人录音」');
  }
  if (n.ambient_source === 'synthetic' && !(nonEmpty(n.ambient_label) && n.ambient_label.indexOf('合成') >= 0)) {
    errors.push(label + '.narrative.ambient_label 合成环境声必须标注「合成」');
  }
});

/* phrases */
var PHRASE_REQUIRED = ['text', 'reading', 'meaning_zh', 'meaning_en', 'speaker', 'audience', 'occasion', 'source_region'];
(d.phrases || []).forEach(function (p, i) {
  var label = 'phrases[' + i + '](' + (p && p.id ? p.id : '缺 id') + ')';
  if (!p || !nonEmpty(p.id)) { errors.push(label + ' 缺少 id'); return; }
  PHRASE_REQUIRED.forEach(function (k) { if (!nonEmpty(p[k])) errors.push(label + '.' + k + ' 为空或缺失'); });
  if (!AUDIO_STATUS[p.audio_status]) errors.push(label + '.audio_status 取值非法：' + JSON.stringify(p.audio_status) + '（只允许 none/provided）');
  if (p.audio_status === 'provided') {
    if (!nonEmpty(p.audio_url)) errors.push(label + '.audio_status=provided 时必须有 audio_url');
    else checkAsset(p.audio_url, label + '.audio_url');
    if (!AUDIO_SOURCE[p.audio_source]) errors.push(label + '.audio_source 取值非法：' + JSON.stringify(p.audio_source));
    if (p.audio_source === 'synthetic' && !(nonEmpty(p.audio_label) && p.audio_label.indexOf('非真人') >= 0)) errors.push(label + '.audio_label 合成语音必须标注「非真人录音」');
    if (p.audio_source === 'spliced' && !(nonEmpty(p.audio_label) && (p.audio_label.indexOf('拼接') >= 0 || p.audio_label.indexOf('非整句') >= 0))) errors.push(label + '.audio_label 拼接音频必须标注「拼接」或「非整句」');
  } else if (!nonEmpty(p.audio_note)) {
    errors.push(label + '.audio_status=none 时必须说明 audio_note');
  }
  if (p.readings !== undefined) {
    if (!Array.isArray(p.readings) || p.readings.length < 2) errors.push(label + '.readings 必须是至少 2 项的数组');
    else p.readings.forEach(function (r, j) {
      var rl = label + '.readings[' + j + ']';
      ['region', 'text', 'reading'].forEach(function (k) { if (!nonEmpty(r[k])) errors.push(rl + '.' + k + ' 为空或缺失'); });
      if (r.source_url && !isHttp(r.source_url)) errors.push(rl + '.source_url 需为 http(s) 链接');
    });
  }
});
var readingsCount = (d.phrases || []).filter(function (p) { return Array.isArray(p.readings) && p.readings.length >= 3; }).length;
if (readingsCount && readingsCount < 2) errors.push('启用多地区读音对照时至少需要 2 条表达，当前 ' + readingsCount + ' 条');
var referencedPhrases = {};
(d.scenes || []).forEach(function (s) { if (s && s.phrase_id) referencedPhrases[s.phrase_id] = true; });
if (Object.keys(referencedPhrases).length < (d.scenes || []).length) errors.push('每个场景必须至少关联 1 条方言表达，当前可到达 ' + Object.keys(referencedPhrases).length + ' 条');
/* 未被任何场景引用的表达必须显式豁免（见 README「内容范围与原型边界」），防止新表达写成后从界面漏挂 */
var PHRASE_EXEMPT = {};
(d.phrases || []).forEach(function (p) {
  if (p && p.id && !referencedPhrases[p.id] && !PHRASE_EXEMPT[p.id]) {
    errors.push('表达 ' + p.id + ' 未被任何场景引用且不在豁免清单：接入场景或加入 PHRASE_EXEMPT 并注明理由');
  }
});

/* tasks：每条路线 3 题、每个场景恰好 1 题 */
(d.tasks || []).forEach(function (t, i) {
  var label = 'tasks[' + i + '](' + (t && t.id ? t.id : '缺 id') + ')';
  if (!t || !nonEmpty(t.id)) { errors.push(label + ' 缺少 id'); return; }
  if (!TASK_TYPES[t.type]) errors.push(label + '.type 取值非法：' + JSON.stringify(t.type));
  if (!nonEmpty(t.prompt)) errors.push(label + '.prompt 为空或缺失');
  if (!nonEmpty(t.explanation)) errors.push(label + '.explanation 为空或缺失');
  if (!Array.isArray(t.options) || t.options.length < 3) errors.push(label + '.options 至少需要 3 个选项');
  else if (typeof t.answer !== 'number' || t.answer % 1 !== 0 || t.answer < 0 || t.answer >= t.options.length) errors.push(label + '.answer 不是 options 的合法下标');
  var rt = (d.routes || []).find(function (r) { return r.id === t.route_id; });
  if (!rt) errors.push(label + '.route_id 引用了不存在的路线：' + JSON.stringify(t.route_id));
  if (!sceneIds[t.scene_id]) errors.push(label + '.scene_id 引用了不存在的场景：' + JSON.stringify(t.scene_id));
  else if (rt && (rt.scene_ids || []).indexOf(t.scene_id) < 0) errors.push(label + '.scene_id 不属于 route_id 指向的路线');
});
(d.routes || []).forEach(function (r) {
  var rtTasks = (d.tasks || []).filter(function (t) { return t.route_id === r.id; });
  if (rtTasks.length !== 3) errors.push('路线 ' + r.id + ' 应有 3 道任务，实际 ' + rtTasks.length + ' 道');
  var taskCount = {};
  rtTasks.forEach(function (t) { taskCount[t.scene_id] = (taskCount[t.scene_id] || 0) + 1; });
  (r.scene_ids || []).forEach(function (id) { if ((taskCount[id] || 0) !== 1) errors.push('路线 ' + r.id + ' 的场景 ' + JSON.stringify(id) + ' 应有且仅有 1 个任务，实际 ' + (taskCount[id] || 0) + ' 个'); });
});

/* qa：每场景至少 5 条、来源与审核状态齐全 */
var qa = Array.isArray(d.qa) ? d.qa : [];
if (!qa.length) errors.push('qa 缺失或为空');
qa.forEach(function (q, i) {
  var label = 'qa[' + i + '](' + (q && q.id ? q.id : '缺 id') + ')';
  if (!q || !nonEmpty(q.id)) { errors.push(label + ' 缺少 id'); return; }
  if (!sceneIds[q.scene_id]) errors.push(label + '.scene_id 引用了不存在的场景：' + JSON.stringify(q.scene_id));
  ['question', 'answer', 'source'].forEach(function (k) { if (!nonEmpty(q[k])) errors.push(label + '.' + k + ' 为空或缺失'); });
  if (!Array.isArray(q.keywords) || !q.keywords.length) errors.push(label + '.keywords 为空或缺失');
  if (q.review_status !== 'reviewed') errors.push(label + '.review_status 必须是 reviewed（知识库只收审核过的答案）');
  if (q.source_url && !isHttp(q.source_url)) errors.push(label + '.source_url 需为 http(s) 链接');
});
var qaByScene = {};
qa.forEach(function (q) { if (q && q.scene_id) qaByScene[q.scene_id] = (qaByScene[q.scene_id] || 0) + 1; });
(d.scenes || []).forEach(function (s) {
  var c = qaByScene[s.id] || 0;
  if (c < 5) errors.push('场景 ' + JSON.stringify(s.id) + ' 应有至少 5 条答疑，实际 ' + c + ' 条');
});
if (qa.length < (d.scenes || []).length * 5) errors.push('MVP 要求每个场景至少 5 条审核答疑，当前总数 ' + qa.length + ' 条');

/* 非遗来源归属护栏（史文 2026-11-18 逐条回源核验结论）：
   英歌三场景与英歌路线的来源必须是 ihchina.cn/project_details/12902（英歌·普宁英歌）。
   同站点其他项目号（例如 13957 剪纸·辉县剪纸）不得用作英歌依据——2026-11 实际发生过 19 处张冠李戴。
   只约束已核验项，未核验场景不拦截，避免误报阻断构建。 */
var ICH_SOURCE_SCOPE = {
  'scene-cz-yingge-role': ['12902'],
  'scene-cz-yingge-team': ['12902'],
  'scene-cz-yingge-legacy': ['12902']
};
var ICH_ROUTE_SOURCE_SCOPE = { 'route-yingge-before': ['12902'] };
function ichId(url) { var m = String(url || '').match(/project_details\/(\d+)/); return m ? m[1] : null; }
function checkIchScope(url, allowed, label) {
  if (!allowed || !allowed.length) return;
  var id = ichId(url);
  if (!id) return;
  if (allowed.indexOf(id) < 0) errors.push(label + ' 的 ihchina 项目号 ' + id + ' 不在已核验范围 [' + allowed.join(',') + '] 内');
}
(d.scenes || []).forEach(function (s, i) {
  if (!s || !s.id) return;
  checkIchScope(s.source_url, ICH_SOURCE_SCOPE[s.id], 'scenes[' + i + '](' + s.id + ')');
});
(d.routes || []).forEach(function (r, i) {
  if (!r || !r.id) return;
  checkIchScope(r.source_url, ICH_ROUTE_SOURCE_SCOPE[r.id], 'routes[' + i + '](' + r.id + ')');
});
(d.qa || []).forEach(function (q, i) {
  if (!q || !q.id) return;
  checkIchScope(q.source_url, ICH_SOURCE_SCOPE[q.scene_id], 'qa[' + i + '](' + q.id + ')');
});

/* 未引用素材盘点：public/ 下的素材会被 Vite 原样复制进 dist/，
   「界面不引用」不等于「未发布」。这里按「种子引用 + 源码引用」做差集，
   把清单打印出来，供素材授权台账与发布前清理对账；只报告，不阻断构建。
   判定为启发式：仅统计常见素材扩展名，路径拼接式引用可能漏判。 */
var ASSET_EXT = /\.(jpg|jpeg|png|gif|webp|svg|mp3|wav|ogg|m4a|aac|flac)$/i;
function listFiles(dir, base, out) {
  var entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (entry) {
    var full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(relative(base, full).split(sep).join('/'));
  });
  return out;
}
function collectBasename(text, sink) {
  var re = /[A-Za-z0-9_\-]+\.(?:jpg|jpeg|png|gif|webp|svg|mp3|wav|ogg|m4a|aac|flac)/gi;
  var m;
  while ((m = re.exec(text)) !== null) sink.add(m[0].toLowerCase());
}
function listSrcFiles(dir, out) {
  var entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (entry) {
    var full = join(dir, entry.name);
    if (entry.isDirectory()) listSrcFiles(full, out);
    else if (/\.(js|css|html|mjs)$/i.test(entry.name)) out.push(full);
  });
  return out;
}
var referenced = new Set();
collectBasename(JSON.stringify(d), referenced);
listSrcFiles(join(root, 'src'), []).forEach(function (f) {
  try { collectBasename(readFileSync(f, 'utf8'), referenced); } catch (e) { /* 读不到就跳过，不阻断 */ }
});
var assetDirs = [join(root, 'public', 'assets'), join(root, 'public', 'yingge', 'assets')];
var assetFiles = [];
assetDirs.forEach(function (dir) { listFiles(dir, root, assetFiles); });
var unreferenced = assetFiles.filter(function (rel) {
  if (!ASSET_EXT.test(rel)) return false;
  var base = rel.split('/').pop().toLowerCase();
  return !referenced.has(base);
}).sort();

if (errors.length) {
  console.error('[check-seed] 种子数据自查未通过，共 ' + errors.length + ' 处：');
  errors.forEach(function (m) { console.error('  - ' + m); });
  process.exit(1);
}
console.log('[check-seed] 种子数据自查通过：' + (d.regions || []).length + ' 个区域（已开放 ' + openActual.length + ' / 未开放 ' + plannedActual.length + '）、' + (d.routes || []).length + ' 条路线、' + (d.scenes || []).length + ' 个场景、' + (d.phrases || []).length + ' 条表达、' + (d.tasks || []).length + ' 个任务、' + qa.length + ' 条答疑；引用、音频、内容量与内容边界检查通过。');
if (unreferenced.length) {
  console.log('[check-seed] 未引用素材盘点：' + unreferenced.length + ' 个（public/ 下会被原样复制进 dist/，仅报告不阻断）：');
  unreferenced.forEach(function (f) { console.log('  - ' + f); });
}
