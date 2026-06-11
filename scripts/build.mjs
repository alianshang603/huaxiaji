/**
 * build.mjs — 一键构建编排（本地或 CI 都用它）。
 * 步骤：
 *   1. 抽取数据 → public/data/*.json
 *   2. 字体子集化 → public/fonts/*.woff2
 *   3. 由模板 + base 注入生成 dist/index.html、复制静态资源
 *   4. 起本地服务 + 无头浏览器预渲染 → dist/<route>/index.html + sitemap + 404
 *
 * 环境变量：
 *   BASE_PATH   默认 /huaxiaji（项目页）。用户主页或自定义域名设为空串 ''。
 *   SITE_URL    站点完整地址，用于 sitemap，如 https://you.github.io/huaxiaji
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = process.env.BASE_PATH ?? '/huaxiaji';
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });

console.log('\n[1/5] 抽取数据');
run('node scripts/extract-data.mjs ./华夏纪.src.html ./public/data');

console.log('\n[2/5] 生成页面模板（剥离数据 + 异步路由）');
run('node scripts/make-template.mjs');

console.log('\n[3/5] 字体子集化');
try { run('node scripts/subset-font.mjs'); }
catch (e) { console.warn('  字体子集化跳过（缺依赖时不阻断构建）'); }

console.log('\n[4/5] 组装 dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
// 复制 public/* 到 dist
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
// 由模板注入 base 生成 index.html
let tpl = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf-8');
const loader = fs.readFileSync(path.join(ROOT, 'src', 'data-loader.js'), 'utf-8');
tpl = tpl
  .replace(/__BASE__/g, JSON.stringify(BASE))
  .replace('<!--DATA_LOADER-->', '<script>' + loader.replace(/__BASE__/g, JSON.stringify(BASE)) + '</script>');
fs.writeFileSync(path.join(DIST, 'index.html'), tpl);
// .nojekyll：避免 GitHub Pages 忽略下划线开头文件
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log('\n[5/5] 预渲染');
const srv = spawn('node', ['scripts/serve.mjs', DIST], { cwd: ROOT, env: { ...process.env, BASE_PATH: BASE }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 1200));
try {
  run('node scripts/prerender.mjs');
} finally {
  srv.kill();
}
console.log('\n✅ 构建完成，产物在 dist/');
