/* Playwright E2E 配置（配置与启动说明见 README「启动」，实机验收见 实机验收清单）。
   - 浏览器用本机 Edge（channel msedge），不另下 Chromium；
   - webServer 先跑完整 build（generate + check:seed + vite build）再 preview，
     保证断言跑在通过种子校验的产物上；若 4173 已有服务则按 reuseExistingServer 复用；
   - 伪麦克风参数让 F-07 跟读录音可以在 headless 下走完入库链路。 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: 'tests',
  testIgnore: /evidence\.spec\.js/,
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    channel: 'msedge',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    permissions: ['microphone'],
  },
  webServer: {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180000,
  },
});
