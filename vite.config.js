import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { PUBLIC_BUILD_EXCLUDE, createPublicCopyFilterPlugin } from './scripts/build-public-filter.mjs';

// base 用相对路径：构建产物可放在任意子路径或直接静态托管
// 多页：岭南（index.html）为主应用，英歌（yingge/index.html）作为内嵌子应用，
// 由岭南 #yingge 路由以 iframe 全屏挂载。两套源码/主题/存储互不干扰。
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  base: './',
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
  // 构建期 public 受限复制：排除用户确认未展示的 6 件素材（原件仍保留在 public/ 内，不移动不删除）。
  // 排除清单在 scripts/build-public-filter.mjs 里按需追加；详见该文件头注释。
  plugins: [createPublicCopyFilterPlugin({ exclude: PUBLIC_BUILD_EXCLUDE })],
  build: {
    target: 'es2020',
    // 关闭 Vite 默认的全量 public 复制，改由上面的插件做精确排除
    copyPublicDir: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        yingge: fileURLToPath(new URL('yingge/index.html', import.meta.url)),
      },
    },
  },
});