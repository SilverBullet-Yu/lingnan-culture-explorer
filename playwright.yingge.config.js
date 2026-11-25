/* 英歌内嵌子应用 E2E 配置（合并进岭南漫游后，机制沿用 原型-英歌 版）。
   - 子应用以 Vite 多页产物 /yingge/index.html 提供，测试直接打这个入口；
     baseURL 用站点根（无路径），spec 里的 goto 已写成 /yingge/index.html#...；
   - 端口用 4519：与岭南 4173、英歌独立仓 4518 错开，避免 reuseExistingServer 打错站点；
   - 串行执行（workers 1）：本机同开多浏览器时 fullyParallel 曾大面积假失败，空闲 + 串行最稳；
   - webServer 跑完整 build（两套 generate + check:seed + vite 多页 build）再 preview，
     断言跑在通过种子校验的产物上。 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: 'tests-yingge',
  testIgnore: /evidence\.spec\.js/,
  timeout: 60000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4519',
    headless: true,
    viewport: { width: 1280, height: 800 },
    channel: 'msedge',
  },
  webServer: {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4519',
    url: 'http://localhost:4519/yingge/index.html',
    reuseExistingServer: false,
    timeout: 180000,
  },
});