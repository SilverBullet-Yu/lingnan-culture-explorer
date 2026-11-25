/* 地图静态配置：从原 atlas.js 抽出的常量，构建期脚本与运行时共用。 */

export const CULTURES = {
  guangfu: { name: '广府文化', color: '#B4442F', dark: '#8E3324', subtitle: '一盅两件，街巷有人情', desc: '从茶楼的点心到骑楼的廊道，从街坊的招呼到戏台上的水袖，在日常生活中认识广府。', keywords: ['早茶', '骑楼', '粤剧'], regions: ['region-gz', 'region-fs'], photo: 'opera.svg', caption: '粤剧戏服、水袖与折扇 · 项目原创教学插图', source: 'https://ich.unesco.org/en/RL/cantonese-opera-00203' },
  /* 客家系首版不启用：色值 #6FBF73 / #4E9A52 本轮保持不变，待客家站开工时另选（现值对页面底 #fff7e8 仅 2.10，不达图形级 3:1）。 */
  kejia: { name: '客家文化', color: '#6FBF73', dark: '#4E9A52', subtitle: '围屋里的家，山歌里的乡', cardTitle: '麒麟起舞，围村同庆', place: '香港', desc: '围龙屋、酿豆腐与客家山歌，连接着聚居生活、饮食习惯和代代相传的乡土记忆。', keywords: ['围龙屋', '酿豆腐', '舞麒麟'], regions: ['region-mz'], photo: 'qilin.svg', caption: '客家舞麒麟：头饰与披布 · 项目原创示意，非现场记录', source: 'https://www.icho.hk/en/web/icho/representative_list_unicorn.html' },
  chaoshan: { name: '潮汕文化', color: '#B87A1F', dark: '#8F5D17', subtitle: '一席工夫茶，慢慢道来', desc: '小小的茶杯里装着待客之道。沿着潮汕街巷，认识工夫茶、地方饮食与潮人的文化生活。', keywords: ['工夫茶', '牌坊街', '潮人节俗'], regions: ['region-cz'], place: '香港', photo: 'yulan.svg', caption: '盂兰胜会供桌上的供果与寿桃 · 项目原创示意，非特定会场', source: 'https://www.icho.hk/en/web/icho/representative_list_yulan.html' },
  other: { name: '其他文化区域', color: '#d7d9d2', dark: '#666e66', regions: [] }
};

export const CITY_CULTURE = {
  440100:'guangfu',440300:'guangfu',440400:'guangfu',440600:'guangfu',440700:'guangfu',440900:'guangfu',441200:'guangfu',441700:'guangfu',441800:'guangfu',441900:'guangfu',442000:'guangfu',445300:'guangfu',
  440200:'kejia',441300:'kejia',441400:'kejia',441600:'kejia',
  440500:'chaoshan',441500:'chaoshan',445100:'chaoshan',445200:'chaoshan',440800:'other'
};

export const SCENE_TOPICS = { 'scene-gz-qilou':'architecture','scene-gz-xiguan':'architecture','scene-gz-street':'architecture','scene-cz-yingge-role':'folk','scene-cz-yingge-team':'folk','scene-cz-yingge-legacy':'folk' };
/* 七类主题按问卷 Q6 兴趣均值排序（饮食 4.57 → 历史人物 4.00） */
export const TOPIC_ORDER = ['food','nature','architecture','folk','dialect','craft','history'];
export const TOPICS = { all:'全部主题', food:'地方饮食', nature:'自然景观', architecture:'特色建筑与历史遗迹', folk:'节庆与民俗', dialect:'方言与地方词语', craft:'非遗技艺', history:'地方历史人物与故事' };

export const ATLAS_TERRITORIES = {
  810000: { name: '香港', color: '#86b5ce', dark: '#507d9d', offset: [100, 72] },
  820000: { name: '澳门', color: '#B0A3BC', dark: '#8C7F99', offset: [-72, 142] }
};

/* 完整地图的纸本色板：浅色用于地块与色标，深色用于侧壁、描边与标记。 */
export const ATLAS_PAPER_PALETTE = {
  guangfu: { color: '#ecd2bf', dark: '#966748' },
  kejia: { color: '#d5e1c4', dark: '#677752' },
  chaoshan: { color: '#ecdcb2', dark: '#927238' },
  other: { color: '#dfe0d2', dark: '#686d5e' },
  810000: { color: '#bfd4df', dark: '#536f88' },
  820000: { color: '#d6c9df', dark: '#786185' },
};

export function atlasPaperFor(code) {
  return ATLAS_PAPER_PALETTE[code] || ATLAS_PAPER_PALETTE[CITY_CULTURE[code] || 'other'];
}

/* 文化着色不决定入口。入口状态对应种子数据，首屏无需等待种子加载。 */
export const MAP_HELP = '选择广州或潮汕进入学习，文化贴纸可查看文化介绍';
export const MAP_DISPLAY_ONLY = '仅地图展示';
export const MAP_CULTURE_LABEL = '文化介绍';
export const MAP_REGION_ENTRIES = [
  { id: 'region-gz', name: '广州', status: 'open', codes: [440100] },
  { id: 'region-cz', name: '潮汕', status: 'open', codes: [440500, 441500, 445100, 445200] },
  { id: 'region-fs', name: '佛山', status: 'planned', codes: [440600] },
  { id: 'region-mz', name: '梅州', status: 'planned', codes: [441400] },
  { id: 'region-hk', name: ATLAS_TERRITORIES[810000].name, status: 'planned', codes: [810000] },
  { id: 'region-mo', name: ATLAS_TERRITORIES[820000].name, status: 'planned', codes: [820000] }
].map(function (region) {
  const code = region.codes[0];
  return {
    ...region,
    href: '#region/' + region.id,
    label: region.status === 'open' ? '进入学习' : '地区简介',
    color: (ATLAS_TERRITORIES[code] || CULTURES[CITY_CULTURE[code]]).color
  };
});

const entriesByCode = Object.fromEntries(MAP_REGION_ENTRIES.flatMap(function (entry) {
  return entry.codes.map(function (code) { return [code, entry]; });
}));

export function mapEntryFor(code) {
  return entriesByCode[code] || null;
}

export const ATLAS_STICKERS = [
  { name: '虾饺', culture: 'guangfu', coord: [113.75, 23.58], image: 'assets/sticker-0.jpg', note: '广式早茶「一盅两件」里最常见的点心之一，薄皮包着虾仁。' },
  { name: '肠粉', culture: 'guangfu', coord: [112.70, 22.55], image: 'assets/sticker-1.jpg', note: '米浆蒸成薄皮再卷上馅料，是广府街巷里的日常早餐。' },
  { name: '烧鹅', culture: 'guangfu', coord: [111.05, 21.55], image: 'assets/sticker-2.jpg', note: '广式烧腊的代表，皮脆肉香，常见于烧味铺与茶楼。' },
  { name: '酿豆腐', culture: 'kejia', coord: [116.05, 24.28], image: 'assets/sticker-3.jpg', note: '客家菜代表，豆腐中酿入肉馅，家常与节庆的餐桌上都能见到。' },
  { name: '盐焗鸡', culture: 'kejia', coord: [114.25, 23.00], image: 'assets/sticker-4.jpg', note: '客家传统做法，用盐导热把鸡焗熟，咸香入味。' },
  { name: '围龙屋', culture: 'kejia', coord: [114.95, 24.30], image: 'assets/sticker-5.jpg', note: '客家聚居建筑，屋舍成围、以祠堂为中心展开。' },
  { name: '工夫茶', culture: 'chaoshan', coord: [116.80, 23.85], image: 'assets/sticker-6.jpg', note: '潮汕人的待客之道，小壶小杯，讲究水温、冲泡与分茶。' },
  { name: '牛肉丸', culture: 'chaoshan', coord: [117.05, 23.15], image: 'assets/sticker-7.jpg', note: '潮汕手打牛肉丸，弹性十足，常配汤粉一起上桌。' },
  { name: '蚝烙', culture: 'chaoshan', coord: [115.60, 22.95], image: 'assets/sticker-8.jpg', note: '潮汕小吃，用生蚝、番薯粉和蛋煎成，外脆内嫩。' }
];

export const DEFAULT_VIEW = { angle: -10, zoom: 1, tilted: true };
export const VIEWBOX = '0 0 1120 760';
export const WALL_DEPTH = 24;

/* 城市名标签的像素级微调，键为 adcode */
export const CITY_LABEL_OFFSETS = { 440100: [-5, 12], 440600: [-5, 14], 440300: [0, 15], 440400: [-10, 11], 441900: [0, 13], 442000: [-5, 10] };

/* 港澳引线标签在窄屏下的替代偏移 */
export const TERRITORY_OFFSET_NARROW = { 810000: [58, 76], 820000: [-64, 142] };
