/* 地图静态配置：英歌原型 · 广东地图示意（fork 自岭南漫游 atlas/config.js，v0.1）。
   本次只保留「潮汕区域高亮可点 + 其他地区显示名称」所需常量，
   贴纸、港澳引线、三大文化圈配色已随旧业务移除（留档 资料区/backups/fork-legacy/atlas3d 及 git 历史）。 */

/* 潮汕区域：汕头 / 汕尾 / 潮州 / 揭阳（普宁为揭阳代管，案例标注“普宁英歌”） */
export const CHAOSHAN_CODES = { 440500: '汕头', 441500: '汕尾', 445100: '潮州', 445200: '揭阳' };

/* 潮汕 / 其他地区的配色（国潮海报色板：潮汕用朱砂浓彩强调，其余为宣纸浅砂） */
export const ZONE_COLORS = {
  chaoshan: { color: '#e8603a', dark: '#9e2410' },
  other: { color: '#ead9b5', dark: '#b09a6c' }
};

/* 点击非潮汕地区时内容面板的说明文案已随 P01 收窄为潮汕单域移除（2026-11-07）。 */

export const DEFAULT_VIEW = { angle: -10, zoom: 1, tilted: true };
/* viewBox 收紧到潮汕四市实际内容（bbox 约 367-772 × 92-572）+ 装饰余量：
   旧值 0 0 1120 760 会让地图只占舞台宽度约 36%，右下大片留白（2026-11-08）。
   render.js 的南海名/浪纹/罗盘坐标与本框配套。 */
export const VIEWBOX = '140 30 860 620';
export const WALL_DEPTH = 24;

/* 城市名标签的像素级微调，键为 adcode（沿用旧版实测偏移） */
export const CITY_LABEL_OFFSETS = { 440100: [-5, 12], 440600: [-5, 14], 440300: [0, 15], 440400: [-10, 11], 441900: [0, 13], 442000: [-5, 10] };
