/* 构建期种子数据引用自查（机制沿用岭南漫游版：漂移零容错）：
   读取 public/assets/seed-data.json，按《英歌舞最小原型设计方案》§16 的数据对象
   校验 culture/chapters/scenes/knowledge/interactions/review/sources/assets 之间的
   引用完整性、必填字段、交付数量（1 文化节点 / 4 章 / 4 场景 12 知识点 / 3 题回顾）
   与关卡参数（§10/§11）；任何一条不满足就逐条打印中文错误并以 exit 1 退出。 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var here = dirname(fileURLToPath(import.meta.url));
/* 统一应用：英歌种子与素材位于根 public/yingge/assets（运行时服务于 /yingge/assets/） */
var root = join(here, '..', '..');
var errors = [];

var d;
try {
  d = JSON.parse(readFileSync(join(root, 'public', 'yingge', 'assets', 'seed-data.json'), 'utf8'));
} catch (e) {
  console.error('[check-seed] 读取或解析 public/yingge/assets/seed-data.json 失败：' + e.message);
  process.exit(1);
}
if (!d || typeof d !== 'object' || Array.isArray(d)) {
  console.error('[check-seed] seed-data.json 顶层必须是对象');
  process.exit(1);
}

function nonEmpty(v) { return typeof v === 'string' && v.replace(/^\s+|\s+$/, '') !== ''; }
function checkAsset(url, label) {
  if (!nonEmpty(url)) return;
  if (!/^(assets\/|https?:\/\/)/.test(url)) { errors.push(label + ' 需以 assets/ 或 http(s):// 开头：' + JSON.stringify(url)); return; }
  if (url.indexOf('assets/') === 0 && !existsSync(join(root, 'public', 'yingge', url))) errors.push(label + ' 指向的本地文件不存在：' + JSON.stringify(url));
}

/* —— culture —— */
var c = d.culture;
if (!c || typeof c !== 'object') {
  errors.push('culture 缺失（本次只交付 1 个文化节点）');
  c = {};
}
['culture_id', 'name', 'case_name', 'catalog_no', 'region', 'source_ref', 'nav_tag', 'hero_image', 'hero_alt', 'hero_caption', 'map_intro', 'map_blurb', 'identity_note', 'learning_question', 'story_title', 'story_intro', 'user_role', 'estimated_minutes', 'source_note', 'ending'].forEach(function (k) {
  if (!nonEmpty(c[k])) errors.push('culture.' + k + ' 为空或缺失');
});
checkAsset(c.hero_image, 'culture.hero_image');
if (!Array.isArray(c.tags) || c.tags.length < 2) errors.push('culture.tags 至少包含名录身份与传统舞蹈两项');

/* —— id 集合 —— */
function collectIds(list, key, name) {
  var out = {}, dup = {};
  (list || []).forEach(function (x, i) {
    if (!x || !nonEmpty(x[key])) { errors.push(name + '[' + i + '] 缺少 ' + key); return; }
    if (out[x[key]] && !dup[x[key]]) { errors.push(name + ' 存在重复 ' + key + '：' + JSON.stringify(x[key])); dup[x[key]] = true; }
    out[x[key]] = true;
  });
  return out;
}
var chapterIds = collectIds(d.chapters, 'chapter_id', 'chapters');
var sceneIds = collectIds(d.scenes, 'scene_id', 'scenes');
var knowledgeIds = collectIds(d.knowledge, 'id', 'knowledge');
var sourceIds = collectIds(d.sources, 'ref', 'sources');
var assetIds = collectIds(d.assets, 'ref', 'assets');
collectIds(d.review, 'id', 'review');

/* —— chapters：4 章、order 连续、interaction/after_scene 可解析、衔接台词完整 —— */
if (!Array.isArray(d.chapters) || d.chapters.length !== 4) errors.push('chapters 必须为 4 章（设计方案交付量），当前：' + (d.chapters || []).length);
(d.chapters || []).forEach(function (ch, i) {
  var label = 'chapters[' + i + '](' + (ch && ch.chapter_id ? ch.chapter_id : '缺 id') + ')';
  if (!ch) return;
  if (ch.order !== i + 1) errors.push(label + '.order 应为 ' + (i + 1) + '（按数组顺序连续）');
  ['title', 'subtitle', 'minutes', 'interaction', 'after_scene', 'interaction_intro'].forEach(function (k) {
    if (!nonEmpty(ch[k])) errors.push(label + '.' + k + ' 为空或缺失');
  });
  if (ch.interaction && !d.interactions[ch.interaction]) errors.push(label + '.interaction 未在 interactions 中定义：' + JSON.stringify(ch.interaction));
  if (ch.after_scene && !sceneIds[ch.after_scene]) errors.push(label + '.after_scene 未在 scenes 中定义：' + JSON.stringify(ch.after_scene));
  if (!Array.isArray(ch.story) || ch.story.length < 1 || !ch.story.every(function (line) { return line && nonEmpty(line.speaker) && nonEmpty(line.text) })) {
    errors.push(label + '.story 需为至少 1 条 {speaker,text} 的对话（每屏一至两句）');
  }
  if (i < 3 && (!ch.next_line || !nonEmpty(ch.next_line.speaker) || !nonEmpty(ch.next_line.text))) {
    errors.push(label + '.next_line 为空（章间衔接台词，设计方案 §7）');
  }
});

/* —— scenes：4 场景、knowledge 各 3 条、asset_ref 可解析 —— */
if (!Array.isArray(d.scenes) || d.scenes.length !== 4) errors.push('scenes 必须为 4 个知识场景，当前：' + (d.scenes || []).length);
(d.scenes || []).forEach(function (s, i) {
  var label = 'scenes[' + i + '](' + (s && s.scene_id ? s.scene_id : '缺 id') + ')';
  if (!s) return;
  ['name', 'intro'].forEach(function (k) { if (!nonEmpty(s[k])) errors.push(label + '.' + k + ' 为空或缺失'); });
  if (!Array.isArray(s.knowledge) || s.knowledge.length !== 3) errors.push(label + '.knowledge 需为 3 个知识点编号（每场景 3 条）');
  (s.knowledge || []).forEach(function (k) { if (!knowledgeIds[k]) errors.push(label + ' 引用了不存在的知识点：' + JSON.stringify(k)); });
  if (s.asset_ref && !assetIds[s.asset_ref]) errors.push(label + '.asset_ref 未在 assets 清单中：' + JSON.stringify(s.asset_ref));
});

/* —— knowledge：12 条、K 编号连续、场景与来源可解析 —— */
if (!Array.isArray(d.knowledge) || d.knowledge.length !== 12) errors.push('knowledge 必须为 12 条（每场景 3 个知识点），当前：' + (d.knowledge || []).length);
(d.knowledge || []).forEach(function (k, i) {
  var label = 'knowledge[' + i + '](' + (k && k.id ? k.id : '缺 id') + ')';
  if (!k) return;
  if (k.id !== 'K' + ('0' + (i + 1)).slice(-2)) errors.push(label + ' 编号需按顺序为 K01…K12，当前：' + JSON.stringify(k.id));
  ['scene', 'object_ref', 'title', 'point', 'text'].forEach(function (f) { if (!nonEmpty(k[f])) errors.push(label + '.' + f + ' 为空或缺失'); });
  if (k.scene && !sceneIds[k.scene]) errors.push(label + '.scene 未在 scenes 中定义：' + JSON.stringify(k.scene));
  if (k.source_ref !== null && k.source_ref !== undefined && !sourceIds[k.source_ref]) errors.push(label + '.source_ref 未在 sources 中定义：' + JSON.stringify(k.source_ref));
});

/* —— interactions：三类关卡 + 第四章人物探索，rhythm 参数为原型交互参数（§10） —— */
var it = d.interactions;
if (!it || typeof it !== 'object') errors.push('interactions 缺失');
else {
  ['mask', 'rhythm', 'teamwork', 'people'].forEach(function (k) { if (!it[k] || it[k].type !== k) errors.push('interactions.' + k + ' 缺失或 type 不符'); });
  if (it.rhythm) {
    var r = it.rhythm;
    if (r.points !== 8) errors.push('interactions.rhythm.points 应为 8（8 个等间隔提示点），当前：' + r.points);
    if (r.interval_ms !== 600) errors.push('interactions.rhythm.interval_ms 应为 600（每点间隔 600 毫秒），当前：' + r.interval_ms);
    if (r.prep_beats !== 4) errors.push('interactions.rhythm.prep_beats 应为 4（先播 4 拍准备提示），当前：' + r.prep_beats);
    if (r.match_window_ms !== 150) errors.push('interactions.rhythm.match_window_ms 应为 150（相差 150 毫秒以内显示「跟上了」），当前：' + r.match_window_ms);
    if (r.slow_interval_ms !== 900) errors.push('interactions.rhythm.slow_interval_ms 应为 900（慢速把间隔调整为 900 毫秒），当前：' + r.slow_interval_ms);
  }
  if (it.teamwork && (!Array.isArray(it.teamwork.options) || it.teamwork.options.length !== 2)) errors.push('interactions.teamwork.options 需为两种配合方式');
}

/* —— review：3 题、每题 2 选项 —— */
if (!Array.isArray(d.review) || d.review.length !== 3) errors.push('review 必须为 3 道回顾题（角色/节奏/协作），当前：' + (d.review || []).length);
(d.review || []).forEach(function (q, i) {
  var label = 'review[' + i + '](' + (q && q.id ? q.id : '缺 id') + ')';
  if (!q) return;
  if (!nonEmpty(q.question)) errors.push(label + '.question 为空');
  if (!Array.isArray(q.options) || q.options.length !== 2) { errors.push(label + '.options 需为 2 个选项'); return; }
  var keys = {};
  q.options.forEach(function (o) {
    if (!o || !nonEmpty(o.key) || !nonEmpty(o.label) || !nonEmpty(o.feedback)) errors.push(label + ' 选项缺少 key/label/feedback');
    else if (keys[o.key]) errors.push(label + ' 选项 key 重复：' + o.key);
    keys[o.key] = true;
  });
});

/* —— references：3 张参考脸谱（A02），展墙与创作关卡共用 —— */
if (!Array.isArray(d.references) || d.references.length !== 3) errors.push('references 必须为 3 张参考脸谱（A02），当前：' + (d.references || []).length);
var refIds = collectIds(d.references, 'ref', 'references');
(d.references || []).forEach(function (r, i) {
  var label = 'references[' + i + '](' + (r && r.ref ? r.ref : '缺 id') + ')';
  if (!r) return;
  ['name', 'role', 'svg', 'detail'].forEach(function (k) { if (!nonEmpty(r[k]) && typeof r[k] !== 'object') errors.push(label + '.' + k + ' 为空或缺失'); });
  if (r.detail && !nonEmpty(r.detail.label)) errors.push(label + '.detail.label 为空（可放大局部）');
  if (r.source_ref && !sourceIds[r.source_ref]) errors.push(label + '.source_ref 未在 sources 中定义：' + JSON.stringify(r.source_ref));
});

/* —— sources：方案〔1〕〔2〕必须齐备 —— */if (!sourceIds['src-1']) errors.push('sources 缺少 src-1（英歌 普宁英歌 国家级非遗项目资料）');
if (!sourceIds['src-2']) errors.push('sources 缺少 src-2（英歌 潮阳英歌 国家级非遗项目资料）');
(d.sources || []).forEach(function (s, i) {
  var label = 'sources[' + i + ']';
  if (!s) return;
  ['title', 'publisher', 'accessed'].forEach(function (k) { if (!nonEmpty(s[k])) errors.push(label + '.' + k + ' 为空或缺失'); });
  if (s.url && !/^https?:\/\//.test(s.url)) errors.push(label + '.url 需为 http(s) 地址：' + JSON.stringify(s.url));
});

/* —— assets：A01-A08 素材清单 —— */
['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08'].forEach(function (ref) {
  if (!assetIds[ref]) errors.push('assets 缺少素材编号 ' + ref + '（设计方案 §17 清单）');
});

/* —— 结果 —— */
if (errors.length) {
  console.error('[check-seed] 种子数据存在 ' + errors.length + ' 处问题：');
  errors.forEach(function (e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
var counts = {
  chapters: (d.chapters || []).length,
  scenes: (d.scenes || []).length,
  knowledge: (d.knowledge || []).length,
  review: (d.review || []).length,
  sources: (d.sources || []).length,
  assets: (d.assets || []).length
};
console.log('[check-seed] 通过：1 个文化节点 · ' + counts.chapters + ' 章故事 · ' + counts.scenes + ' 个知识场景 '
  + counts.knowledge + ' 个知识点 · ' + counts.review + ' 道回顾题 · ' + counts.sources + ' 条来源 · ' + counts.assets + ' 项素材清单');
