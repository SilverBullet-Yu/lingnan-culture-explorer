/* 全局状态与本地存储（英歌原型 v0.1，fork 自岭南漫游 store.js）：
   localStorage 五键 —— 进度 progress、收藏 favorites（绑定 K 编号）、成果 result、
   作品索引 works、界面设置 settings（清除记录时保留）。
   按设计方案 §16 的数据对象：progress=当前页/章节/阶段/已探索/已完成/更新时间；
   result=回顾题首次与最近答案、观察文字；作品画布数据与预览图体量大，
   批2 起入 IndexedDB，localStorage 只存作品索引。 */
/* 读出后按期望容器类型校验：键被改坏（旧版本残留、浏览器扩展或同源脚本写入）时
   回到空容器，而不是让渲染链路对非对象/非数组取值抛错、每次刷新都白屏 */
function loadStore(key, fallback, kind) { try { var v = JSON.parse(localStorage.getItem(key)); if (kind === 'array') return Array.isArray(v) ? v : fallback; return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback } catch (e) { return fallback } }

/* 界面设置（跨刷新保留；清除学习记录时不清除） */
var defaultSettings = { sound: true, motion: false, slow: false, subtitle: true, showDots: false };
function loadSettings() {
  var s = loadStore('yingge-settings', {});
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  Object.keys(defaultSettings).forEach(function (k) { if (s[k] === undefined) s[k] = defaultSettings[k] });
  return s;
}
/* 收藏元素级净化：容器是数组但元素非字符串（改坏数据）时剔除 */
function sanitizeFavorites(list) { return list.filter(function (x) { return typeof x === 'string' }) }
var settings = loadSettings();
function saveSettings() { try { localStorage.setItem('yingge-settings', JSON.stringify(settings)) } catch (e) { /* 存储不可用时保留会话内设置 */ } }

function emptyProgress() { return { current: null, chapters: {}, explored: {}, interactions: {}, updatedAt: null } }

export var state = {
  data: null,
  progress: Object.assign(emptyProgress(), loadStore('yingge-progress', {})),
  favorites: sanitizeFavorites(loadStore('yingge-favorites', [], 'array')),
  result: loadStore('yingge-result', {}),
  works: loadStore('yingge-works', [], 'array'),
  /* 会话内 UI 状态（不入库）：P01 地图面板的选中区域 */
  atlas: { city: null }
};
/* 跨标签页一致性：另一页清除或改写本机数据后（storage 事件只在非改动页触发），
   本页重读全部键并同步设置——否则旧内存状态会在下次 save() 时“复活”已被清除的记录 */
export function reloadState() {
  state.progress = Object.assign(emptyProgress(), loadStore('yingge-progress', {}));
  state.favorites = sanitizeFavorites(loadStore('yingge-favorites', [], 'array'));
  state.result = loadStore('yingge-result', {});
  state.works = loadStore('yingge-works', [], 'array');
  settings = loadSettings();
}
export function setSound(on) { settings.sound = !!on; saveSettings() }
export function soundOn() { return !!settings.sound }
export function setSlow(on) { settings.slow = !!on; saveSettings() }
export function slowOn() { return !!settings.slow }
export function setSubtitle(on) { settings.subtitle = !!on; saveSettings() }
export function subtitleOn() { return !!settings.subtitle }
export function setShowDots(on) { settings.showDots = !!on; saveSettings() }
export function showDotsOn() { return !!settings.showDots }
export function setMotion(v) { settings.motion = !!v; saveSettings() }
export function motionPref() { return !!settings.motion }
export function save() {
  state.progress.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem('yingge-progress', JSON.stringify(state.progress));
    localStorage.setItem('yingge-favorites', JSON.stringify(state.favorites));
    localStorage.setItem('yingge-result', JSON.stringify(state.result));
    localStorage.setItem('yingge-works', JSON.stringify(state.works));
    window.dispatchEvent(new CustomEvent('yingge-save', { detail: { ok: true, at: state.progress.updatedAt } }));
    return true;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('yingge-save', { detail: { ok: false } }));
    return false;
  }
}
export function storageAvailable() { try { localStorage.setItem('yingge-probe', '1'); localStorage.removeItem('yingge-probe'); return true } catch (e) { return false } }

/* —— 内容查询器（seed-data 到达后可用） —— */
export function culture() { return state.data ? state.data.culture : null }
export function chapters() { return state.data && Array.isArray(state.data.chapters) ? state.data.chapters : [] }
export function chapter(id) { return chapters().filter(function (c) { return c.chapter_id === id })[0] || null }
export function scenes() { return state.data && Array.isArray(state.data.scenes) ? state.data.scenes : [] }
export function sceneData(id) { return scenes().filter(function (s) { return s.scene_id === id })[0] || null }
export function knowledgeList() { return state.data && Array.isArray(state.data.knowledge) ? state.data.knowledge : [] }
export function knowledge(id) { return knowledgeList().filter(function (k) { return k.id === id })[0] || null }
export function sources() { return state.data && Array.isArray(state.data.sources) ? state.data.sources : [] }
export function sourceFor(ref) { return sources().filter(function (s) { return s.ref === ref })[0] || null }
export function reviewQuestions() { return state.data && Array.isArray(state.data.review) ? state.data.review : [] }
export function interactionSpec(type) { return state.data && state.data.interactions ? state.data.interactions[type] : null }

/* —— 记录读写 —— */
/* 记录章节阶段：剧情 story / 互动 interact / 反馈 feedback / 探索 explore（§16 阶段转换） */
export function setChapterStage(chapterId, stage) {
  var rec = state.progress.chapters[chapterId] || {};
  var stages = ['story', 'interact', 'feedback', 'explore'];
  rec.reached = stages[Math.max(stages.indexOf(rec.reached || rec.stage || 'story'), stages.indexOf(stage))];
  rec.stage = stage;
  rec.at = new Date().toISOString();
  state.progress.chapters[chapterId] = rec;
  state.progress.current = { chapter: chapterId, stage: stage };
  save();
}
export function chapterStage(chapterId) {
  var rec = state.progress.chapters[chapterId];
  return rec ? rec.stage : null;
}
/* 标记知识点已探索；返回是否为新探索（用于计数变化提示） */
export function markExplored(kId, sceneId) {
  if (state.progress.explored[kId]) return false;
  state.progress.explored[kId] = { at: new Date().toISOString(), scene: sceneId || null };
  save();
  return true;
}
export function exploredCount() { return Object.keys(state.progress.explored).length }
export function isExplored(kId) { return !!state.progress.explored[kId] }
export function fav(id) { return state.favorites.indexOf(id) >= 0 }
export function toggleFav(id) {
  if (fav(id)) state.favorites = state.favorites.filter(function (x) { return x !== id });
  else state.favorites.push(id);
  save();
}
export function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? String(iso).slice(0, 10) : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) }
export function fmtTime(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? String(iso).slice(11, 16) : ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) }
export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
/* 外链地址白名单：只放行 http(s)/blob/mailto 与站内相对地址，其余（javascript:/data: 等
   可执行 scheme）丢弃换 '#' */
export function safeUrl(u) { var s = String(u == null ? '' : u); return /^(https?:|blob:|mailto:|#|\/|\.{1,2}\/)/i.test(s) || s.indexOf(':') < 0 ? s : '#' }

/* 导出观察记录 JSON（§15）：含收藏、文字、进度与作品索引；作品图片需逐件下载 PNG。
   顶部保存条在保存失败时调用，作为本机记录的唯一导出入口。 */
export function exportData() {
  var payload = {
    app: 'yingge-prototype',
    version: state.data ? state.data.version : '1.1.0',
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    favorites: state.favorites,
    result: state.result,
    works: state.works
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '英歌观察记录-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href) }, 2000);
}
