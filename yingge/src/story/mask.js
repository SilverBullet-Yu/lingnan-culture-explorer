/* 第一章 脸谱创作关卡（设计方案 §8）：
   左侧三张有资料编号的参考脸谱（可放大局部、查看案例说明），
   中间个人创作画布（基础脸形 + 画笔 + 图形），右侧工具（色彩/画笔/图形/撤销/重做/清空）。
   至少一笔绘制或放置一个图形后可保存；清空先显示预览与确认；
   草稿在短暂停顿后自动保存（§15），再次进入时恢复（「接着做」）。
   「观看创作示范」记录后直接进入反馈阶段（展墙在批3 接入）。
   作品画布数据与预览图存 IndexedDB（works-db.js），localStorage 只存索引。 */
import { esc, save, state } from '../store.js';
import { interactionData, saveInteractionData } from './flow.js';
import { putWork } from '../works-db.js';

/* —— 自绘教学脸谱：成人头面 + 戏曲色块，不作真实照片使用 ——
   形态依据汕头职业技术学院《英歌舞百科全书·脸谱》关胜、李逵两个条目页，
   逐部位取证见 资料区/验证/20261110-站源脸谱重绘/取证记录.md：
   平涂重色块、细白勾边、额心纹样、黑色眼窝翅形、短髭须。
   关胜取白—黑—白—蓝—白五道鬓带与黑髭；李逵取额顶云纹、白环额心与白唇环。
   第三张为对照花脸，页面无对应条目，只沿用两页共用的色块语言。
   发际45、眉94、鼻底144、颏194，三庭约49/50/50；眼宽约25、脸宽约125。
   耳颈先画、头部后遮盖，五官逐侧生成；色块以眉心为轴镜像，天然对称。 */
var FACE_PATH = 'M100 10 C73 8 51 20 44 42 C38 62 43 81 40.5 98 C38 111 40 124 44 137 C48 146 49 157 57 167 C65 179 74 188 87 193 C96 197 105 198 113 194 C128 188 140 178 147 166 C153 155 155 146 159 134 C162 122 162 109 160 96 C156 81 163 61 157 44 C150 24 130 11 100 10Z';
var FACE_ANATOMY = {
  eyes: [{ cx: 75.5, cy: 107, width: 25, height: 6.6, side: 1 }, { cx: 125.5, cy: 107.6, width: 24.3, height: 6.4, side: -1 }],
  ears: [{ x: 0, y: 0, scale: 1 }, { x: 200.5, y: 2.7, scale: -.98 }],
  skin: ['#f0c3ae', '#cf9a80', '#6b4a3a']
};
var faceSerial = 0;
function faceNum(n) { return Number(n.toFixed(2)) }
/* 色块以 x=100 为轴镜像：half 只写右半，左半用同一份路径翻转。 */
function faceMirror(half) {
  return '<g>' + half + '</g><g transform="translate(200 0) scale(-1 1)">' + half + '</g>';
}

/* field 主色区、band 黑色块、line 白色勾边、accent 第二重色、warm 金色、
   pale 露出的肤色。色值取自条目图区域取样的近似值：
   关胜朱红 #FF6E4F / 蓝 #5170C3；李逵墨黑 #040000 / 品红 #FE448B /
   珊瑚红 #FF4459 / 绿 #009D62；两页共用浅桃肤色 #F9D1C5 与白勾边。 */
var FACES = {
  red: {
    field: '#ff6e4f', field2: '#e3543a', band: '#0b0807', line: '#ffffff',
    accent: '#5170c3', warm: '#f5b32c', pale: '#f9d1c5',
    skin: ['#f9d1c5', '#e6b6a6', '#a8796a'], shadow: '#6d2218', light: '#ffd8c2',
    iris: ['#8a6a45', '#4a3524', '#171310'], lid: '#2a1512', wet: '#f2c6b4',
    lip: '#c6191f', lipDark: '#7e1210', lipHi: '#e8574b', ink: '#0b0807'
  },
  dark: {
    field: '#060505', field2: '#1c1a19', band: '#000000', line: '#ffffff',
    accent: '#fe448b', warm: '#009d62', pale: '#f9d2c3',
    skin: ['#f9d2c3', '#d8a48f', '#7a4c3e'], shadow: '#000000', light: '#9a9890',
    iris: ['#8a6a45', '#4a3524', '#171310'], lid: '#0a0a09', wet: '#e8b6a0',
    lip: '#c4191f', lipDark: '#7d0f0d', lipHi: '#e0534a', ink: '#050505'
  },
  /* 对照用对称花脸：页面无此条目，只沿用两页共用的色块语言，不对应具体人物。 */
  paint: {
    field: '#ff6e4f', field2: '#d84a33', band: '#0b0807', line: '#ffffff',
    accent: '#f5b32c', warm: '#f5b32c', pale: '#f9d1c5',
    skin: ['#f9d1c5', '#e6b6a6', '#a8796a'], shadow: '#5a1a14', light: '#ffd8c2',
    iris: ['#8a6a45', '#4a3524', '#171310'], lid: '#2a1512', wet: '#f2c6b4',
    lip: '#c6191f', lipDark: '#7e1210', lipHi: '#e8574b', ink: '#0b0807'
  }
};

function faceDefs(id, p) {
  var flesh = FACE_ANATOMY.skin;
  return '<defs>'
    + '<radialGradient id="' + id + '-flesh" cx="32%" cy="30%" r="78%"><stop stop-color="' + flesh[0] + '"/><stop offset=".55" stop-color="' + flesh[1] + '"/><stop offset="1" stop-color="' + flesh[2] + '"/></radialGradient>'
    + '<radialGradient id="' + id + '-skin" cx="34%" cy="28%" r="76%"><stop stop-color="' + p.skin[0] + '"/><stop offset=".6" stop-color="' + p.skin[1] + '"/><stop offset="1" stop-color="' + p.skin[2] + '"/></radialGradient>'
    + '<radialGradient id="' + id + '-field" cx="38%" cy="24%" r="82%"><stop stop-color="' + p.field + '"/><stop offset=".66" stop-color="' + p.field + '"/><stop offset="1" stop-color="' + p.field2 + '"/></radialGradient>'
    + '<radialGradient id="' + id + '-light"><stop stop-color="' + p.light + '" stop-opacity=".6"/><stop offset=".5" stop-color="' + p.light + '" stop-opacity=".2"/><stop offset="1" stop-color="' + p.light + '" stop-opacity="0"/></radialGradient>'
    + '<radialGradient id="' + id + '-shade"><stop stop-color="' + p.shadow + '" stop-opacity=".75"/><stop offset=".6" stop-color="' + p.shadow + '" stop-opacity=".28"/><stop offset="1" stop-color="' + p.shadow + '" stop-opacity="0"/></radialGradient>'
    + '<radialGradient id="' + id + '-sclera" cx="40%" cy="55%" r="68%"><stop stop-color="#f6f1e6"/><stop offset=".6" stop-color="#e4ded0"/><stop offset="1" stop-color="#b9b3a4"/></radialGradient>'
    + '<radialGradient id="' + id + '-iris"><stop stop-color="' + p.iris[2] + '"/><stop offset=".5" stop-color="' + p.iris[0] + '"/><stop offset=".86" stop-color="' + p.iris[1] + '"/><stop offset="1" stop-color="' + p.iris[2] + '"/></radialGradient>'
    + '<filter id="' + id + '-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>'
    + '<clipPath id="' + id + '-clip"><path d="' + FACE_PATH + '"/></clipPath>'
    + '</defs>';
}

/* 颈部从下颌后侧入颅，喉结低于颏；耳轮上缘与眉、耳垂与鼻底对应。 */
function faceNeck(id) {
  return '<g class="face-neck">'
    + '<path d="M67 165 C72 187 70 208 61 220 L43 235 Q101 244 158 235 L140 220 C130 210 128 186 135 165 Z" fill="url(#' + id + '-flesh)"/>'
    + '<path d="M70 175 Q100 202 131 176 L127 198 Q104 218 73 194 Z" fill="#38281f" opacity=".63"/>'
    + '<path d="M72 195 Q83 213 88 233 M129 195 Q119 215 114 234" fill="none" stroke="#795338" stroke-width="3.5" opacity=".35"/>'
    + '<path d="M96 214 Q100 209 104 215 L107 222 Q102 226 96 224 L94 220 Z" fill="#8f6548" opacity=".6"/>'
    + '<path d="M96 215 Q101 212 104 216" fill="none" stroke="#ecc7a0" stroke-width=".7" opacity=".65"/>'
    + '<path d="M8 240Q20 222 46 216L66 205Q80 216 101 228Q117 217 135 205L153 214Q181 219 194 240Z" fill="#28241b"/>'
    + '</g>';
}
/* 衣领分前后襟，颧侧反光、下颌色面共用；保留三套有出处的额心、鬓带、眼窝和唇环。 */
function faceCollar(p) {
  return '<g><path d="M8 240Q20 221 49 215L63 209Q74 225 95 235L87 240Z" fill="#364e47"/><path d="M90 240Q115 224 136 207L151 216Q133 232 119 240Z" fill="' + p.band + '"/><path d="M64 206Q82 220 99 226L94 231Q73 222 59 211Zm34 25Q122 216 134 205L142 210Q120 227 102 236Z" fill="#d6b77b"/><path d="M28 233q15 -12 28 -13m91 3q13 1 26 10" fill="none" stroke="#8f8872" stroke-width="1.25"/></g>';
}
function facePlanes(id) {
  return '<g clip-path="url(#' + id + '-clip)" pointer-events="none"><path d="M40 49Q50 50 52 68Q48 91 54 108Q49 120 59 137Q63 157 77 168Q62 164 56 152Q43 139 39 117Z" fill="#fff1d8" opacity=".16"/><path d="M153 45Q146 83 153 101Q157 122 147 137Q141 145 137 157Q121 178 100 185Q82 183 69 175Q77 192 100 200Q144 191 160 146Q170 95 157 46Z" fill="#3c2624" opacity=".23"/><path d="M56 123q6 8 16 9m55 12q7 -3 11 -8" stroke="#fbd4b4" fill="none" stroke-width="1.2" opacity=".52"/></g>';
}
function faceEars(id) {
  return FACE_ANATOMY.ears.map(function (ear) {
    return '<g class="face-ear" transform="translate(' + ear.x + ' ' + ear.y + ') scale(' + ear.scale + ' 1)">'
      + '<path d="M44 96 C33 88 28 96 31 107 C30 115 34 121 34 128 C34 139 40 148 45 143 L49 128 Z" fill="url(#' + id + '-flesh)"/>'
      + '<path d="M41 99 C33 95 33 103 35 111 C37 116 37 126 39 131 Q41 137 43 132" fill="none" stroke="#82553d" stroke-width="1.7"/>'
      + '<path d="M42 106 Q36 103 38 112 Q43 115 39 123 L43 125" fill="none" stroke="#e1b38c" stroke-width="1.1"/>'
      + '<path d="M44 116 Q38 116 41 126 L45 128" fill="#674531" opacity=".7"/>'
      + '</g>';
  }).join('');
}

/* 头部先铺主色，再按角色叠鬓带、眼窝、鼻梁与额心纹样；色块左右镜像。 */
function faceShell(id, p, k) {
  return '<path class="face-head" d="' + FACE_PATH + '" fill="url(#' + id + '-skin)"/>'
    + '<g clip-path="url(#' + id + '-clip)">'
    + '<path d="' + FACE_PATH + '" fill="url(#' + id + '-field)"/>'
    + faceFields(k, p)
    + '<ellipse cx="100" cy="197" rx="44" ry="9" fill="url(#' + id + '-shade)" opacity=".45"/>'
    + '</g>';
}

function faceFields(k, p) {
  if (k === 'red') return faceFieldsRed(p);
  if (k === 'dark') return faceFieldsDark(p);
  return faceFieldsPaint(p);
}

/* 关胜：朱红底、颧骨以下露肤；额心太极，五道鬓带入鬓，黑色眼窝翅形托起凤眼。 */
function faceFieldsRed(p) {
  var half = ''
    /* 颧骨以下到下巴整片浅桃肤色，上缘沿颧骨略作起伏（取证：颊） */
    + '<path d="M100 116 C93 118 87 115 81 117 C74 119 67 125 62 133 C56 142 54 152 57 162 C60 173 66 183 74 190 C82 196 92 199 100 199 Z" fill="' + p.pale + '"/>'
    /* 黑色眼窝翅形自鼻根上挑入鬓，包住整只眼；下缘只落在眼睑下方（取证：眉/眼） */
    + '<path d="M93 80 C82 78 70 70 58 59 C52 54 49 49 47 45 C43 57 43 73 46 85 C49 99 55 109 63 114 C72 119 83 118 91 113 Z" fill="' + p.band + '"/>'
    /* 自太极外缘入鬓的五道条带，内→外为白—黑—白—蓝—白（取证：额侧/鬓） */
    + '<path d="M99 44 C83 42 66 35 51 21" fill="none" stroke="' + p.line + '" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M99 50 C84 48 68 41 55 28" fill="none" stroke="' + p.band + '" stroke-width="6.2" stroke-linecap="round"/>'
    + '<path d="M99 56 C85 54 71 47 59 36" fill="none" stroke="' + p.line + '" stroke-width="2.6" stroke-linecap="round"/>'
    + '<path d="M99 61 C87 59 74 52 63 42" fill="none" stroke="' + p.accent + '" stroke-width="3.4" stroke-linecap="round"/>'
    + '<path d="M99 66 C89 64 78 58 68 49" fill="none" stroke="' + p.line + '" stroke-width="2.1" stroke-linecap="round"/>'
    /* 下眼睑白色细勾边、内眼角下方金黄色小勾（取证：眼） */
    + '<path d="M87 113 C79 118 69 117 62 111" fill="none" stroke="' + p.line + '" stroke-width="2.3"/>'
    + '<path d="M88 112 C86 117 82 119 78 118" fill="none" stroke="' + p.warm + '" stroke-width="2"/>'
    /* 鼻翼黑色涡卷（如意头），涡心留出肤色（取证：鼻） */
    + '<path d="M94 130 C87 128 81 131 81 136 C81 141 86 143 90 141 C93 139 93 135 90 134 C88 133 86 135 87 137" fill="none" stroke="' + p.band + '" stroke-width="3.4" stroke-linecap="round"/>'
    + '<path d="M88 139 Q91 143 95 140" fill="none" stroke="' + p.band + '" stroke-width="2.2"/>';
  return faceMirror(half)
    /* 额心太极：白圈包边，左半黑、右半品红；黑半下部白点，红半上部黄点（取证：额） */
    + '<circle cx="100" cy="62" r="21" fill="' + p.line + '"/>'
    + '<path d="M100 43.6 A18.4 18.4 0 0 0 100 80.4 A9.2 9.2 0 0 1 100 62 A9.2 9.2 0 0 0 100 43.6 Z" fill="' + p.band + '"/>'
    + '<path d="M100 43.6 A18.4 18.4 0 0 1 100 80.4 A9.2 9.2 0 0 0 100 62 A9.2 9.2 0 0 1 100 43.6 Z" fill="#ff1349"/>'
    + '<circle cx="100" cy="51.8" r="3" fill="' + p.warm + '"/>'
    + '<circle cx="100" cy="72.2" r="3" fill="' + p.line + '"/>'
    /* 鼻梁白条，两侧金黄细线，再外侧蓝色细线（取证：鼻） */
    + '<path d="M100 84 L100 132" fill="none" stroke="' + p.line + '" stroke-width="5.4" stroke-linecap="round"/>'
    + '<path d="M100 86 L100 130" fill="none" stroke="' + p.warm + '" stroke-width="1.2"/>'
    + '<path d="M94.5 88 C93.6 104 93.8 119 95.4 131" fill="none" stroke="' + p.warm + '" stroke-width="2.2"/>'
    + '<path d="M90.5 90 C89 106 89.6 120 91.8 132" fill="none" stroke="' + p.accent + '" stroke-width="2.4"/>';
}

/* 李逵：墨底白线，额顶云纹、额心白环赤块、品红鬓带，白线绕眼并垂到口角。 */
function faceFieldsDark(p) {
  var half = ''
    /* 鬓带自外向内为白带—品红带—白细线，再内为黑底（取证：额侧/鬓） */
    + '<path d="M47 96 C45 74 52 52 66 37" fill="none" stroke="' + p.line + '" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M57 98 C54 76 61 56 74 42" fill="none" stroke="' + p.accent + '" stroke-width="6.6" stroke-linecap="round"/>'
    + '<path d="M66 100 C63 80 70 61 81 48" fill="none" stroke="' + p.line + '" stroke-width="2.2" stroke-linecap="round"/>'
    /* 白色长弧自眉尾/太阳穴下行，绕眼窝外侧到颧下，末端在口角外分两条细须线（取证：颊） */
    + '<path d="M96 90 C84 82 68 86 61 97 C55 106 57 116 64 123 C59 140 66 156 79 165" fill="none" stroke="' + p.line + '" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M69 133 C66 149 72 161 83 168" fill="none" stroke="' + p.line + '" stroke-width="2" stroke-linecap="round"/>'
    /* 鼻梁两侧红色细线（取证：鼻） */
    + '<path d="M95.6 96 C94.8 112 95 126 95.8 136" fill="none" stroke="#ff4459" stroke-width="1.8"/>'
    /* 唇下浅桃下巴块，块内黑色双卷须纹（取证：口/须） */
    + '<path d="M100 176 C110 176 119 180 124 185 C127 190 122 194 115 195 C107 196 102 195 100 195 Z" fill="' + p.pale + '"/>'
    + '<path d="M100 184 C104 186 109 186 112 183" fill="none" stroke="' + p.band + '" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M100 189 C103 191 107 191 110 189" fill="none" stroke="' + p.band + '" stroke-width="1.8" stroke-linecap="round"/>';
  return faceMirror(half)
    /* 额顶白色云纹：中轴如意云头，向两侧各盘一枚云勾，横贯额顶（取证：额） */
    + faceMirror('<path d="M100 44 C96 34 86 30 79 34 C72 38 73 47 80 49 C85 51 89 46 86 42 C84 39 80 41 80 44" fill="none" stroke="' + p.line + '" stroke-width="4" stroke-linecap="round"/>')
    /* 额心白环 + 珊瑚红块 + 绿色 S 形曲纹（取证：额心） */
    + '<circle cx="100" cy="70" r="13.5" fill="none" stroke="' + p.line + '" stroke-width="3"/>'
    + '<path d="M100 60 C107 67 108 77 100 82 C92 77 93 67 100 60 Z" fill="#ff4459"/>'
    + '<path d="M95 76 C104 72 95 66 103 62" fill="none" stroke="' + p.warm + '" stroke-width="2.6" stroke-linecap="round"/>'
    /* 环底细竖线接到鼻根，鼻梁白色宽带（取证：额/鼻） */
    + '<path d="M100 84 L100 100" fill="none" stroke="' + p.line + '" stroke-width="1.8"/>'
    + '<path d="M100 100 L100 140" fill="none" stroke="' + p.line + '" stroke-width="6.2" stroke-linecap="round"/>';
}

/* 对照花脸：页面无对应条目，只沿用关胜、李逵两页共用的色块语言，不对应任何人物。 */
function faceFieldsPaint(p) {
  var half = ''
    + '<path d="M100 122 C93 124 86 121 80 123 C73 125 67 131 62 138 C56 147 55 156 58 166 C61 176 67 185 75 191 C83 196 92 199 100 199 Z" fill="' + p.pale + '"/>'
    + '<path d="M93 80 C82 78 70 70 58 59 C52 54 49 49 47 45 C43 57 43 73 46 85 C49 99 55 109 63 114 C72 119 83 118 91 113 Z" fill="' + p.band + '"/>'
    /* 五道鬓带，第四道取金替代关胜页的蓝，其余形态同源 */
    + '<path d="M99 46 C83 44 66 36 51 22" fill="none" stroke="' + p.line + '" stroke-width="6.6" stroke-linecap="round"/>'
    + '<path d="M99 52 C84 50 68 42 55 29" fill="none" stroke="' + p.band + '" stroke-width="6" stroke-linecap="round"/>'
    + '<path d="M99 58 C85 56 71 48 59 37" fill="none" stroke="' + p.line + '" stroke-width="2.4" stroke-linecap="round"/>'
    + '<path d="M99 63 C87 61 74 53 63 43" fill="none" stroke="' + p.warm + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M99 68 C89 66 78 59 68 50" fill="none" stroke="' + p.line + '" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M87 113 C79 118 69 117 62 111" fill="none" stroke="' + p.line + '" stroke-width="2.2"/>'
    + '<path d="M94 130 C87 128 81 131 81 136 C81 141 86 143 90 141 C93 139 93 135 90 134 C88 133 86 135 87 137" fill="none" stroke="' + p.band + '" stroke-width="3.4" stroke-linecap="round"/>'
    + '<path d="M88 139 Q91 143 95 140" fill="none" stroke="' + p.band + '" stroke-width="2.2"/>';
  return faceMirror(half)
    /* 额饰取「白圈 + 曲纹」的共用语言：白盘、黑盘、金 S */
    + '<circle cx="100" cy="64" r="17" fill="' + p.line + '"/>'
    + '<circle cx="100" cy="64" r="13.4" fill="' + p.band + '"/>'
    + '<path d="M96 70 C105 66 95 60 104 56" fill="none" stroke="' + p.warm + '" stroke-width="2.6" stroke-linecap="round"/>'
    + '<path d="M100 81 L100 100" fill="none" stroke="' + p.warm + '" stroke-width="1.6"/>'
    + '<path d="M100 100 L100 132" fill="none" stroke="' + p.line + '" stroke-width="4.8" stroke-linecap="round"/>'
    + '<path d="M100 102 L100 130" fill="none" stroke="' + p.warm + '" stroke-width="1.6"/>'
    + '<path d="M90.5 92 C89 108 89.6 121 91.8 132" fill="none" stroke="' + p.line + '" stroke-width="1.4"/>';
}

/* 髭须：关胜为黑色上卷短髭加下颌细髯；李逵无长须（下巴用浅肤块 + 黑卷须纹）；对照脸同关胜。 */
function faceBeard(k, p) {
  if (k === 'dark') return '';
  return '<g class="face-beard">' + faceMirror(
    /* 上唇上方黑色八字须，向两侧下卷至下颌角，末端细尖（取证：口/须） */
    '<path d="M100 145 C110 144 119 148 124 155 C128 161 125 169 120 172" fill="none" stroke="' + p.band + '" stroke-width="6.4" stroke-linecap="round"/>'
    + '<path d="M119 171 C114 173 111 170 113 166" fill="none" stroke="' + p.band + '" stroke-width="2.8" stroke-linecap="round"/>'
    /* 下颌两侧各一缕细黑髯，末端上卷（取证：颊） */
    + '<path d="M63 158 C58 167 58 177 63 182 C65 184 68 183 67 180" fill="none" stroke="' + p.band + '" stroke-width="2" stroke-linecap="round"/>'
  ) + '</g>';
}

/* 眉形依取证：关胜为黑色翅形眉带（与眼窝连写，上缘白线）；李逵为浅桃新月眉加白线。 */
function faceBrow(k, p) {
  if (k === 'dark') {
    return '<g class="face-brow">' + faceMirror(
      '<path d="M96 93 C88 87 76 85 67 88 C73 95 85 97 95 96 Z" fill="' + p.pale + '"/>'
      + '<path d="M95 90 C87 86 76 85 68 87" fill="none" stroke="' + p.line + '" stroke-width="2.4" stroke-linecap="round"/>'
    ) + '</g>';
  }
  var half = '<path d="M91 77 C81 75 70 68 58 57 C52 52 49 47 47 43" fill="none" stroke="' + p.line + '" stroke-width="2"/>';
  return '<g class="face-brow">' + faceMirror(half) + '</g>';
}

/* 眼裂约占脸宽五分之一；虹膜被上下睑遮挡，巩膜不使用纯白。 */
function faceEye(id, p) {
  return FACE_ANATOMY.eyes.map(function (eye, index) {
    var w = eye.width, h = eye.height, s = eye.side, clip = id + '-eye-' + index;
    var upper = 'M' + faceNum(-w / 2 * s) + ' 0 C' + faceNum(-w * .3 * s) + ' ' + faceNum(-h * .82)
      + ' ' + faceNum(w * .14 * s) + ' ' + faceNum(-h * .85) + ' ' + faceNum(w / 2 * s) + ' .6';
    var lower = 'C' + faceNum(w * .2 * s) + ' ' + faceNum(h * .72) + ' ' + faceNum(-w * .22 * s) + ' ' + faceNum(h * .7) + ' ' + faceNum(-w / 2 * s) + ' 0';
    var shape = upper + ' ' + lower + ' Z', rays = '';
    for (var i = 0; i < 40; i++) {
      var a = i * Math.PI / 20, r = 3.8 + (i % 5) / 4 * 1.2;
      rays += '<path d="M' + faceNum(Math.cos(a) * 2.2) + ' ' + faceNum(Math.sin(a) * 2.2)
        + ' L' + faceNum(Math.cos(a + .03) * r) + ' ' + faceNum(Math.sin(a + .03) * r) + '" stroke="' + p.iris[i % 3] + '" stroke-width=".27" opacity=".8"/>';
    }
    return '<g class="face-eye" transform="translate(' + eye.cx + ' ' + eye.cy + ')">'
      + '<defs><clipPath id="' + clip + '"><path d="' + shape + '"/></clipPath></defs>'
      + '<ellipse cy="-2" rx="21" ry="14" fill="url(#' + id + '-shade)" opacity=".82"/>'
      + '<ellipse cx="-2" cy="-11" rx="18" ry="5" fill="url(#' + id + '-light)" opacity=".5"/>'
      + '<path d="' + upper + '" transform="translate(0 -5)" fill="none" stroke="' + p.shadow + '" stroke-width="1" opacity=".7"/>'
      + '<path d="' + upper + '" transform="translate(0 -1)" fill="none" stroke="' + p.lid + '" stroke-width="3"/>'
      + '<path class="face-eye-opening" d="' + shape + '" fill="url(#' + id + '-sclera)"/>'
      + '<g clip-path="url(#' + clip + ')">'
      + '<circle class="face-iris" cy="-.4" r="5.4" fill="url(#' + id + '-iris)"/>'
      + rays + '<circle cy="-.4" r="2.25" fill="' + p.iris[2] + '"/>'
      + '<path d="' + upper + '" fill="none" stroke="#232019" stroke-width="3.4" opacity=".45"/>'
      + '<circle cx="-1.8" cy="-2" r=".6" fill="#fff3d2" opacity=".9"/>'
      + '<path d="M1.2 2.8 L2.1 2.4" stroke="#dcc8a8" stroke-width=".45" opacity=".7"/>'
      + '</g>'
      + '<path d="' + upper + '" fill="none" stroke="' + p.ink + '" stroke-width="1.15"/>'
      + '<path d="M' + faceNum(w / 2 * s) + ' .6 ' + lower + '" transform="translate(0 1)" fill="none" stroke="' + p.lid + '" stroke-width="1.5"/>'
      + '<path d="M' + faceNum(w / 2 * s) + ' .6 ' + lower + '" fill="none" stroke="' + p.wet + '" stroke-width=".6" opacity=".9"/>'
      + '<path d="M' + faceNum(w * .31 * s) + ' 3.2 Q0 6 ' + faceNum(-w * .24 * s) + ' 3.6" fill="none" stroke="#f4ddbc" stroke-width=".35" opacity=".55"/>'
      + '<ellipse cx="' + faceNum((w / 2 - 1) * s) + '" cy=".7" rx="1.3" ry=".8" fill="#a77a68"/>'
      + '<path d="M' + faceNum(-w / 2 * s) + ' 4 q' + (-3 * s) + ' 2 ' + (-5 * s) + ' 1 M' + faceNum(-w / 2 * s) + ' 6 q' + (-3 * s) + ' 3 ' + (-4 * s) + ' 3" fill="none" stroke="' + p.shadow + '" stroke-width=".4" opacity=".4"/>'
      + '</g>';
  }).join('');
}

/* 鼻梁线由色块给出，这里只补鼻翼与鼻孔，保持平涂语言不堆体积。
   关胜与对照脸的鼻翼黑涡卷已在 fields 画出，此处不再叠黑色翼块；
   李逵依取证保留白色如意形鼻翼勾边。 */
function faceNose(id, k, p) {
  var dark = k === 'dark';
  var wing = '<path d="M96 140 C92 134 85 134 83 138 C81 142 84 145 88 144"';
  return '<g class="face-nose">'
    + (dark ? faceMirror(wing + ' fill="none" stroke="' + p.line + '" stroke-width="1.7"/>') : '')
    + '<ellipse cx="100" cy="132" rx="7" ry="5" fill="url(#' + id + '-light)" opacity=".45"/>'
    + '<path d="M96 144 Q100 147 104 144" fill="none" stroke="' + (dark ? p.line : p.band) + '" stroke-width="1.3" opacity=".7"/>'
    + '<ellipse cx="100" cy="148" rx="12" ry="3.4" fill="url(#' + id + '-shade)" opacity=".4"/>'
    + '</g>';
}

/* 口裂落在下庭上三分之一；朱唇外一圈白勾边（李逵页作粗勾边，关胜页作细线）。 */
function faceMouth(id, k, p) {
  var edge = k === 'dark' ? p.line : p.lipDark;
  return '<g class="face-mouth">'
    /* 唇外白色勾边（取证：关胜「唇外白线勾边」、李逵「唇周白色粗勾边」） */
    + '<path d="M81 159 C88 153 94 151 100 154 C106 151 112 153 119 159 C113 173 107 177 100 177 C93 177 87 173 81 159 Z" fill="' + p.line + '"/>'
    + '<path d="M82 160 C88 156 94 154 100 157 C106 154 112 156 118 160 C112 162 106 161 100 161 C94 161 88 162 82 160 Z" fill="' + p.lip + '"/>'
    + '<path d="M84 161 C90 164 110 164 116 161 C112 169 106 172 100 172 C94 172 88 169 84 161 Z" fill="' + p.lipHi + '"/>'
    + '<path d="M82 160 C88 162 94 161 100 161 C106 161 112 162 118 160" fill="none" stroke="' + p.lipDark + '" stroke-width="1.4"/>'
    + '<path d="M84 161 C90 164 110 164 116 161" fill="none" stroke="' + edge + '" stroke-width="1"/>'
    + (k === 'dark' ? '<path d="M82 160 C88 156 94 154 100 157 C106 154 112 156 118 160 C112 169 106 173 100 173 C94 173 88 169 82 160 Z" fill="none" stroke="' + p.line + '" stroke-width="2.2"/>' : '')
    + '<ellipse cx="100" cy="177" rx="15" ry="4" fill="url(#' + id + '-shade)" opacity=".4"/>'
    + '</g>';
}

export function faceSvg(kind) {
  var k = kind === 'red' ? 'red' : kind === 'dark' ? 'dark' : 'paint';
  var p = FACES[k], id = 'fs-' + k + '-' + (++faceSerial);
  return '<svg viewBox="0 0 200 240" role="img" aria-label="参考脸谱示意图">'
    + faceDefs(id, p) + faceNeck(id) + faceCollar(p) + faceEars(id) + faceShell(id, p, k) + facePlanes(id)
    + faceBrow(k, p) + faceEye(id, p) + faceNose(id, k, p) + faceMouth(id, k, p) + faceBeard(k, p)
    + '</svg>';
}

/* —— 关卡挂载（bindStoryPage 调用） —— */
export function mountMask(el, chapterId, api) {
  var refs = (state.data && state.data.references) || [];
  var data = interactionData(chapterId);
  var draft = data.draft || {};
  var strokes = Array.isArray(draft.strokes) ? draft.strokes.map(function (s) { return JSON.parse(JSON.stringify(s)) }) : [];
  var redoStack = [];
  var seenRefs = Array.isArray(draft.seenRefs) ? draft.seenRefs.slice() : [];
  var tool = 'brush';
  var color = '#cf3a1c';
  var size = 8;
  var shape = 'dot';
  var drawing = null;
  var saveTimer = 0;
  var active = true, saving = false, pendingId = null;
  var dialogOpener = null;

  el.innerHTML = [
    '<div class="mask-layout">',
    '<div class="mask-refs" aria-label="参考脸谱">' + refs.map(function (r) {
      return '<button class="mask-ref" type="button" data-ref="' + esc(r.ref) + '">'
        + '<span class="mask-ref-face">' + faceSvg(r.svg) + '</span>'
        + '<b>' + esc(r.name) + '</b><small>参考 ' + esc(r.ref.replace('face-', '')) + '</small></button>';
    }).join('') + '</div>',
    '<div class="mask-canvas-wrap">',
    '<canvas id="mask-canvas" width="960" height="1040" aria-label="个人创作画布"></canvas>',
    '<p class="muted small-note">作品将标注为「受英歌启发的个人创作」</p>',
    '</div>',
    '<div class="mask-tools" aria-label="创作工具">',
    '<div><b>色彩</b><div class="mask-colors">' + ['#26190d', '#cf3a1c', '#dfa63c', '#2f6e54', '#31536f', '#f6d9c4'].map(function (c) {
      return '<button type="button" class="mask-color' + (c === color ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '" aria-label="选择颜色 ' + c + '"></button>';
    }).join('') + '</div></div>',
    '<div><b>画笔粗细</b><div class="mask-sizes">' + [4, 8, 14].map(function (s) {
      return '<button type="button" class="mask-size' + (s === size ? ' on' : '') + '" data-size="' + s + '" aria-label="画笔粗细 ' + s + '"><i style="width:' + (s + 4) + 'px;height:' + (s + 4) + 'px"></i></button>';
    }).join('') + '</div></div>',
    '<div><b>画笔 / 图形</b><div class="mask-shapes">'
    + '<button type="button" class="mask-shape' + (tool === 'brush' ? ' on' : '') + '" data-draw="brush">画笔</button>'
    + '<button type="button" class="mask-shape' + (shape === 'dot' && tool === 'shape' ? ' on' : '') + '" data-shape="dot">圆点</button>'
    + '<button type="button" class="mask-shape' + (shape === 'band' && tool === 'shape' ? ' on' : '') + '" data-shape="band">颊纹</button>'
    + '<button type="button" class="mask-shape' + (shape === 'star' && tool === 'shape' ? ' on' : '') + '" data-shape="star">花纹</button>'
    + '</div></div>',
    '<div class="mask-history">',
    '<button type="button" class="btn secondary" id="mask-undo">撤销</button>',
    '<button type="button" class="btn secondary" id="mask-redo">重做</button>',
    '<button type="button" class="btn secondary" id="mask-clear">清空作品</button>',
    '</div>',
    '<div class="mask-save">',
    '<label for="mask-name">作品名称</label>',
    '<input id="mask-name" maxlength="20" value="' + esc(draft.name || '') + '" placeholder="给作品起个名字（默认：我的英歌脸谱）">',
    (draft.editOf ? '<p class="small-note">正在编辑作品副本；保存将生成新作品，原作保留。</p>' : ''),
    '<div id="mask-save-status" role="status" aria-live="polite"></div>',
    '<button type="button" class="btn" id="mask-save" disabled>保存并去展墙</button>',
    '<button type="button" class="btn secondary" id="mask-demo">观看创作示范</button>',
    '<p class="muted small-note">至少画一笔或放置一个图形后可保存' + (data.demo ? '；你已看过创作示范' : '') + '</p>',
    '</div>',
    '</div>',
    '</div>',
    '<div class="mask-lightbox" id="mask-lightbox" hidden><div class="mask-lightbox-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="参考脸谱放大"></div></div>'
  ].join('');

  var canvas = el.querySelector('#mask-canvas');
  var ctx = canvas.getContext('2d');
  var lightbox = el.querySelector('#mask-lightbox');
  var lightboxCard = el.querySelector('.mask-lightbox-card');
  var nameInput = el.querySelector('#mask-name');
  var status = el.querySelector('#mask-save-status');

  function openDialog(label) {
    dialogOpener = document.activeElement;
    lightboxCard.setAttribute('aria-label', label);
    lightbox.hidden = false;
    el.querySelector('.mask-layout').inert = true;
    (lightboxCard.querySelector('button') || lightboxCard).focus();
  }
  function closeDialog() {
    lightbox.hidden = true;
    el.querySelector('.mask-layout').inert = false;
    if (dialogOpener && dialogOpener.isConnected) dialogOpener.focus();
    dialogOpener = null;
  }
  function dialogKeys(event) {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDialog() }
    if (event.key === 'Tab') {
      var buttons = Array.from(lightboxCard.querySelectorAll('button, a[href]'));
      var first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === lightboxCard)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  document.addEventListener('keydown', dialogKeys);

  /* 基础脸形底稿 */
  function drawBase() {
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fdf8ec';
    ctx.strokeStyle = '#a5771a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(480, 520, 300, 380, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#b98d3c';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(220, 380);
    ctx.quadraticCurveTo(480, 260, 740, 380);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(360, 700);
    ctx.quadraticCurveTo(480, 760, 600, 700);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawStroke(s) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.tool === 'brush') {
      if (s.points.length && s.points.every(function (p) { return p[0] === s.points[0][0] && p[1] === s.points[0][1] })) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.points[0][0], s.points[0][1], s.size, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size * 2;
      ctx.beginPath();
      s.points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]) });
      ctx.stroke();
      return;
    }
    ctx.fillStyle = s.color;
    if (s.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.shape === 'band') {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.size * 4, s.size * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var angle = Math.PI / 3 * i;
        var r = i % 2 ? s.size * 1.6 : s.size * 3.4;
        var px = s.x + Math.cos(angle) * r;
        var py = s.y + Math.sin(angle) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function redraw() {
    drawBase();
    strokes.forEach(drawStroke);
    el.querySelector('#mask-save').disabled = strokes.length === 0;
  }

  /* 草稿含作品名；pagehide/离开阶段立即落盘，包括尚未 pointerup 的一笔。 */
  function flushDraft() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = 0;
    saveInteractionData(chapterId, { draft: {
      strokes: JSON.parse(JSON.stringify(strokes)), seenRefs: seenRefs.slice(),
      name: nameInput.value, ...(draft.editOf ? { editOf: draft.editOf } : {})
    } });
  }
  function scheduleDraft() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDraft, 800);
  }
  nameInput.addEventListener('input', scheduleDraft);
  window.addEventListener('pagehide', flushDraft);
  api.registerCleanup(function (options) {
    active = false;
    if (options && options.discardDraft) { clearTimeout(saveTimer); saveTimer = 0 }
    else flushDraft();
    window.removeEventListener('pagehide', flushDraft);
    document.removeEventListener('keydown', dialogKeys);
    closeDialog();
  });

  /* 画笔（鼠标与触控统一 pointer 事件） */
  function canvasPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', function (event) {
    if (saving || drawing || event.button !== 0 || !lightbox.hidden) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    if (tool === 'brush') {
      drawing = { tool: 'brush', color: color, size: size, points: [canvasPoint(event)] };
      strokes.push(drawing);
      redraw();
    } else {
      var p = canvasPoint(event);
      strokes.push({ tool: 'shape', shape: shape, color: color, size: size, x: p[0], y: p[1] });
      redoStack = [];
      redraw();
      scheduleDraft();
    }
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!drawing) return;
    drawing.points.push(canvasPoint(event));
    redraw();
  });
  function finishStroke() {
    if (!drawing) return;
    drawing = null;
    redoStack = [];
    scheduleDraft();
  }
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);

  /* 工具绑定：视觉选中状态与辅助技术保持一致。 */
  function syncTools() {
    el.querySelectorAll('.mask-color, .mask-size, .mask-shape').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.classList.contains('on')));
    });
  }
  el.querySelector('.mask-tools').addEventListener('click', syncTools);
  syncTools();
  el.querySelectorAll('.mask-color').forEach(function (b) {
    b.onclick = function () { color = b.dataset.color; el.querySelectorAll('.mask-color').forEach(function (x) { x.classList.toggle('on', x === b) }) };
  });
  el.querySelectorAll('.mask-size').forEach(function (b) {
    b.onclick = function () { size = Number(b.dataset.size); el.querySelectorAll('.mask-size').forEach(function (x) { x.classList.toggle('on', x === b) }) };
  });
  el.querySelectorAll('.mask-shape').forEach(function (b) {
    b.onclick = function () {
      if (b.dataset.draw === 'brush') { tool = 'brush' }
      else { tool = 'shape'; shape = b.dataset.shape }
      el.querySelectorAll('.mask-shape').forEach(function (x) { x.classList.toggle('on', x === b) });
    };
  });

  /* 撤销 / 重做 / 清空（清空先显示预览与确认，§8） */
  el.querySelector('#mask-undo').onclick = function () {
    if (!strokes.length) return;
    redoStack.push(strokes.pop());
    redraw();
    scheduleDraft();
  };
  el.querySelector('#mask-redo').onclick = function () {
    if (!redoStack.length) return;
    strokes.push(redoStack.pop());
    redraw();
    scheduleDraft();
  };
  el.querySelector('#mask-clear').onclick = function () {
    if (!strokes.length) return;
    finishStroke();
    lightboxCard.innerHTML = '<h3>清空当前作品？</h3>'
      + '<div class="mask-ref-big"><img src="' + canvas.toDataURL('image/png') + '" alt="即将清空的当前画布预览" width="240" height="260"></div>'
      + '<p>将移除全部 ' + strokes.length + ' 笔操作；清空后可点「重做」逐笔恢复。</p>'
      + '<button type="button" class="btn secondary" id="clear-cancel">保留作品</button> '
      + '<button type="button" class="btn" id="clear-confirm">确认清空</button>';
    openDialog('清空作品确认');
    lightboxCard.querySelector('#clear-cancel').onclick = closeDialog;
    lightboxCard.querySelector('#clear-confirm').onclick = function () {
      while (strokes.length) redoStack.push(strokes.pop());
      redraw();
      scheduleDraft();
      closeDialog();
    };
  };

  /* 参考脸谱放大：记录看过的参考（保存时随作品记录） */
  el.querySelectorAll('.mask-ref').forEach(function (b) {
    b.onclick = function () {
      var r = refs.filter(function (x) { return x.ref === b.dataset.ref })[0];
      if (!r) return;
      if (seenRefs.indexOf(r.ref) < 0) { seenRefs.push(r.ref); scheduleDraft() }
      lightboxCard.innerHTML = '<div class="mask-ref-big">' + faceSvg(r.svg) + '</div>'
        + '<div role="group" aria-label="参考观察范围"><button type="button" data-viewbox="0 0 200 240" aria-pressed="true">整体</button> '
        + '<button type="button" data-viewbox="40 75 120 55" aria-pressed="false">眉眼</button> '
        + '<button type="button" data-viewbox="40 20 65 80" aria-pressed="false">线条局部</button></div>'
        + '<h3>' + esc(r.name) + ' <small>参考 ' + esc(r.ref.replace('face-', '')) + '</small></h3>'
        + '<p><b>角色呈现：</b>' + esc(r.role) + '</p>'
        + '<p><b>' + esc(r.detail.label) + '：</b>' + esc(r.detail.note) + '</p>'
        + '<button type="button" class="btn" id="lightbox-close">回到创作</button>';
      openDialog('参考脸谱放大');
      lightboxCard.querySelectorAll('[data-viewbox]').forEach(function (btn) {
        btn.onclick = function () {
          lightboxCard.querySelector('svg').setAttribute('viewBox', btn.dataset.viewbox);
          lightboxCard.querySelectorAll('[data-viewbox]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)) });
        };
      });
      lightboxCard.querySelector('#lightbox-close').onclick = closeDialog;
    };
  });
  lightbox.addEventListener('click', function (event) { if (event.target === lightbox) closeDialog() });

  /* 导出始终取当前画布；即使 IndexedDB/localStorage 失败也不丢失本次创作。 */
  function downloadCurrent() {
    var name = nameInput.value.trim() || '我的英歌脸谱';
    var cv = document.createElement('canvas');
    cv.width = canvas.width;
    cv.height = canvas.height + 108;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fdf8ec';
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(canvas, 0, 0);
    cx.fillStyle = '#26190d';
    cx.font = 'bold 34px "Microsoft YaHei", sans-serif';
    cx.fillText('《' + name + '》', 32, canvas.height + 44, cv.width - 64);
    cx.font = '24px "Microsoft YaHei", sans-serif';
    cx.fillText('受英歌启发的个人创作 · 英歌 · 上场之前', 32, canvas.height + 84, cv.width - 64);
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.png';
    document.body.append(a);
    a.click();
    a.remove();
  }
  function saveFailure() {
    if (!active) return;
    status.innerHTML = '<p>作品尚未完整保存（本机存储不可用或已满）。画布仍保留在本页，请先下载当前 PNG，再尝试释放存储空间。</p>'
      + '<button type="button" class="btn secondary" id="mask-download-current">下载当前 PNG（含作品名与个人创作标注）</button> '
      + '<button type="button" class="btn" id="mask-retry">重试保存</button> '
      + '<span class="small-note">已有记录可用顶部「导出观察记录」备份。</span>';
    status.querySelector('#mask-download-current').onclick = downloadCurrent;
    status.querySelector('#mask-retry').onclick = saveWork;
  }
  function setSaving(value) {
    saving = value;
    el.querySelector('.mask-tools').inert = value;
    el.querySelectorAll('.mask-ref').forEach(function (b) { b.disabled = value });
    el.querySelector('#mask-save').disabled = value || !strokes.length;
  }
  async function saveWork() {
    if (!strokes.length || saving) return;
    finishStroke();
    flushDraft();
    setSaving(true);
    status.textContent = '正在保存作品…';
    try {
      var name = nameInput.value.trim() || '我的英歌脸谱';
      var id = pendingId || ('W' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
      pendingId = id;
      var work = { id: id, name: name, at: new Date().toISOString(), refs: seenRefs.slice(),
        strokes: JSON.parse(JSON.stringify(strokes)), png: canvas.toDataURL('image/png'), chapter: chapterId };
      await putWork(work);
      /* 保留失败索引的会话副本以便用顶部「导出观察记录」备份；重试复用编号，不重复插入。 */
      var index = state.works.findIndex(function (w) { return w.id === id });
      var entry = { id: id, name: name, at: work.at, refs: work.refs };
      if (index < 0) state.works.push(entry); else state.works[index] = entry;
      if (save() === false) throw new Error('作品索引保存失败');
      if (!active) return;
      /* main 按 data-feedback-work 从 IndexedDB 加载图片，summary 绝不存 base64。 */
      api.done('<p><b>《' + esc(name) + '》已保存</b>（作品编号 ' + esc(id) + '）。'
        + (draft.editOf ? '本次编辑已另存为新作品，原作保留。' : '')
        + '回看你的主色与眉眼：它们想让人一眼看出什么性格？</p>'
        + '<figure class="result-work"><div class="result-work-img"><img data-feedback-work="' + esc(id) + '" alt="作品《' + esc(name) + '》实际预览"></div>'
        + '<figcaption>受英歌启发的个人创作</figcaption></figure>'
        + '<p><a class="btn secondary" href="#explore/wall/K02">查看参考 K02，对照我的作品 →</a></p>');
    } catch (error) { saveFailure() }
    finally { if (active) setSaving(false) }
  }
  el.querySelector('#mask-save').onclick = saveWork;

  /* 示范在反馈阶段直接展示三步累积图，保留原有 stage-advance 推进入口。 */
  el.querySelector('#mask-demo').onclick = function () {
    flushDraft();
    saveInteractionData(chapterId, { demo: true });
    var steps = [
      ['1. 定主色', '先用红色强调额心，留出眉眼观察空间。'],
      ['2. 画眉眼', '沿左右眉弓画出上挑线条，比较两侧的方向。'],
      ['3. 添线条', '在双颊添加呼应的线条，再检查主次与对称。']
    ];
    var example = steps.map(function (step, i) {
      return '<figure><svg width="160" height="208" viewBox="0 0 200 260" role="img" aria-label="' + step[0] + '示范">'
        + '<ellipse cx="100" cy="125" rx="72" ry="100" fill="#fdf8ec" stroke="#a5771a" stroke-width="2"/>'
        + '<path d="M78 42 Q100 28 122 42 L114 85 Q100 98 86 85Z" fill="#cf3a1c"/>'
        + (i > 0 ? '<path d="M46 103 Q66 81 89 110 M111 110 Q134 81 154 103" fill="none" stroke="#26190d" stroke-width="8" stroke-linecap="round"/>' : '')
        + (i > 1 ? '<path d="M50 137 Q58 168 78 179 M150 137 Q142 168 122 179" fill="none" stroke="#cf3a1c" stroke-width="7" stroke-linecap="round"/>' : '')
        + '</svg><figcaption><b>' + step[0] + '</b><p>' + step[1] + '</p></figcaption></figure>';
    }).join('');
    api.done('<h3>创作示范 · 分步观察</h3><p>以下为受英歌启发的个人创作示范，不是传统角色脸谱的复刻。</p>'
      + '<div class="result-work-grid">' + example + '</div>'
      + '<p>你的画布草稿已保留，可以随时接着画。</p><a class="btn" href="#explore/wall/K02">进入展墙 →</a> '
      + '<a class="btn secondary" href="#story/ch1/interact">接着创作我的脸谱 →</a>');
  };

  redraw();
}
