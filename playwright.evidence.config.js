/* 证据截图专用配置：`npm run evidence` 触发，产出 原型/资料区/验证/20261115-现行界面证据/ 整页截图。
   与回归套件分离（主配置已 testIgnore 本文件），避免常规测试跑出截图噪声。 */
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /evidence\.spec\.js/,
  reporter: [['list']],
  /* 10 张整页截图含两次 reload 与三维收敛等待，继承主配置的 30s 不够 */
  timeout: 180000,
});
