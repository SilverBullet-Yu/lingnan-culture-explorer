/* 第四章 人物与今日传承（设计方案 §12）：
   以国家级非遗代表性传承人陈来发为观察对象，按「开始学习 / 一起排练 / 参与表演」
   呈现三张记录卡（据人民日报公开报道整理，非本人原话；照片当前未接入）。
   用户先选择最感兴趣的问题，画面定位到相应记录卡并展开；另两个问题仍可点击。
   知识入口与收藏按 object_ref 归位：第一张卡 K10，第三张卡 K11、K12；第二张卡不挂入口。
   报道引述位：引用人民日报报道，界面注明「非本人原话、非采录原声」（原声待 A06 采录）。
   底部按钮「整理我的观察册」进入成果页。 */
import { esc, fav, markExplored, state, toggleFav, sourceFor, safeUrl } from '../store.js';
import { interactionData, saveInteractionData } from './flow.js';
import { popEl, motionReduced } from '../motionx.js';

var CARDS = [
  {
    key: 'card-start', question: '最初怎样开始', kIds: ['K10'], name: '开始学习',
    text: '陈来发小时候在村里看前辈画脸谱、舞双槌。18 岁加入南山英歌队，从握槌、站步开始系统学起。',
    detail: '记录卡 1 · 据人民日报 2026-03-27 报道整理 · 非本人原话；照片当前未接入'
  },
  {
    key: 'card-practice', question: '配合怎样练习', kIds: [], name: '一起排练',
    text: '训练中，他要求每个队员学会所有位置；一个动作没做到位，就反复练到整齐。',
    detail: '记录卡 2 · 据人民日报 2026-03-27 报道整理 · 非本人原话；照片当前未接入'
  },
  {
    key: 'card-perform', question: '表演时怎样面向观众', kIds: ['K11', 'K12'], name: '参与表演',
    text: '1990 年起他接手教练工作。1992 年带队参赛时，他把队形改为面向观众，让队伍正面朝向看戏的人。',
    detail: '记录卡 3 · 据人民日报 2026-03-27 报道整理 · 非本人原话；照片当前未接入'
  }
];

/* 报道引述（非采录原声）：引用人民日报报道，地方原声待 A06 采录后恢复 */
var VOICE = {
  line: '「英歌舞有强大的生命力，英歌舞的鼓声从历史中传来，也必将继续响亮地传下去。」',
  source: '人民日报 2026-03-27《踏歌执槌 传承技艺五十载》报道引述',
  note: '非本人原话，非采录原声；地方原声待采录与母语者核对后接入。'
};

function sourceLink() {
  var item = state.data.knowledge.find(function (k) { return k.id === 'K10' });
  var src = item && sourceFor(item.source_ref);
  return src && src.url ? '<p><a class="mini-btn" href="' + esc(safeUrl(src.url)) + '" target="_blank" rel="noopener noreferrer">查看原资料 · ' + esc(src.publisher) + ' ↗</a></p>' : '';
}

export function mountPeople(el, chapterId, api) {
  var data = interactionData(chapterId);
  var picked = data.picked || 'card-start';
  var expanded = null;

  function kTitle(kId) {
    var list = (state.data && state.data.knowledge) || [];
    var k = list.filter(function (x) { return x.id === kId })[0];
    return k ? k.title : kId;
  }

  el.innerHTML = [
    '<div class="people-card">',
    '<p class="tag">人物记录 · 据公开报道整理，非本人原话</p>',
    '<h3>你最感兴趣的问题是？</h3>',
    '<div class="people-questions">' + CARDS.map(function (c) {
      return '<button type="button" class="people-q" data-key="' + c.key + '">' + esc(c.question) + '</button>';
    }).join('') + '</div>',
    '<div class="people-cards">' + CARDS.map(function (c) {
      return '<article class="people-record" id="pr-' + c.key + '">'
        + '<div class="people-photo"><img width="120" height="84" style="display:block;width:132px;max-width:100%;height:auto;border-radius:6px" src="assets/' + ({'card-start':'yg-role.svg','card-practice':'yg-legacy.svg','card-perform':'yg-team.svg'})[c.key] + '" alt="' + ({'card-start':'练习纸上的脸谱与短槌','card-practice':'练习者持槌的手部','card-perform':'同一时刻的队员位置'})[c.key] + '，原创示意，非人物照片"></div>'
        + '<h4>' + esc(c.name) + '</h4>'
        + '<p class="people-text">' + esc(c.text) + '</p>'
        + '<p class="muted small-note">' + esc(c.detail) + '</p>'
        + sourceLink()
        + (c.kIds.length ? '<div class="people-tools">' + c.kIds.map(function (kId) {
          return '<button type="button" class="btn secondary people-k" data-k="' + kId + '">知识说明 ' + esc(kTitle(kId)) + '</button>'
            + '<button type="button" class="btn secondary" data-fav="' + kId + '">' + (fav(kId) ? '已收藏' : '收藏') + '</button>';
        }).join('') + '</div>' : '')
        + '</article>';
    }).join('') + '</div>',
    '<div class="people-voice" id="people-voice">',
    '<b>报道引述 <small class="muted">（非采录原声）</small></b>',
    '<p class="people-voice-line">' + esc(VOICE.line) + '</p>',
    '<p class="muted"><b>出处：</b>' + esc(VOICE.source) + '。' + esc(VOICE.note) + '</p>',
    '</div>',
    '<div class="story-actions"><a class="btn" href="#result">整理我的观察册 →</a></div>',
    '</div>'
  ].join('');

  function focusCard(key, scroll) {
    picked = key;
    if (scroll) saveInteractionData(chapterId, { picked: key });
    el.querySelectorAll('.people-q').forEach(function (b) { b.classList.toggle('on', b.dataset.key === key) });
    el.querySelectorAll('.people-record').forEach(function (a) { a.classList.toggle('on', a.id === 'pr-' + key) });
    if (scroll) {
      var card = el.querySelector('#pr-' + key);
      if (card) card.scrollIntoView({ behavior: motionReduced() ? 'instant' : 'smooth', block: 'nearest' });
    }
  }

  el.querySelectorAll('.people-q').forEach(function (b) {
    b.onclick = function () { focusCard(b.dataset.key, true) };
  });

  /* 知识说明：展开为卡内说明并计为已探索（K10-K12） */
  el.querySelectorAll('.people-k').forEach(function (b) {
    b.onclick = function () {
      var kId = b.dataset.k;
      var list = (state.data && state.data.knowledge) || [];
      var k = list.filter(function (x) { return x.id === kId })[0];
      if (!k) return;
      expanded = kId;
      markExplored(kId, 'people');
      var target = b.closest('.people-record');
      var box = target.querySelector('.people-knowledge');
      if (!box) {
        box = document.createElement('div');
        box.className = 'people-knowledge';
        target.insertBefore(box, target.querySelector('.people-tools'));
      }
      box.innerHTML = '<b>' + esc(k.id) + ' · ' + esc(k.title) + '</b><p>' + esc(k.point) + esc(k.text) + '</p>';
      box.hidden = false;
    };
  });

  /* 收藏（绑定 K 编号） */
  el.querySelectorAll('[data-fav]').forEach(function (b) {
    b.onclick = function () {
      toggleFav(b.dataset.fav);
      b.textContent = fav(b.dataset.fav) ? '已收藏' : '收藏';
      popEl(b);
    };
  });

  focusCard(picked, false);
}
