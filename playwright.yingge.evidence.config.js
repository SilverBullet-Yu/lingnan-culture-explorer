/* 英歌证据截图专用配置：`npm run evidence:yingge` 触发。
   与回归套件分离（主配置已 testIgnore evidence.spec.js），避免常规测试跑出截图噪声。
   产物：原型/资料区/验证/导航与功能清查-20261111/（见 evidence.spec.js 里的 DIR）。 */
import { defineConfig } from '@playwright/test';
import base from './playwright.yingge.config.js';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /evidence\.spec\.js/,
  reporter: [['list']],
});