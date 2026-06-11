/**
 * dev-preview.mjs — 无需 playwright/字体依赖的快速本地预览。
 * 只做：抽数据 + 组装 dist（跳过字体子集化与预渲染），起静态服务。
 * 用于开发期快速看效果；正式发布请用 npm run build（含字体+SSG）。
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = process.env.BASE_PATH ?? '/huaxiaji';

execSync('node scripts/extract-data.mjs ./华夏纪.src.html ./public/data', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/make-template.mjs', { cwd: ROOT, stdio: 'inherit' });
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
let tpl = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf-8');
const loader = fs.readFileSync(path.join(ROOT, 'src', 'data-loader.js'), 'utf-8');
tpl = tpl.replace(/__BASE__/g, JSON.stringify(BASE))
         .replace('<!--DATA_LOADER-->', '<script>' + loader.replace(/__BASE__/g, JSON.stringify(BASE)) + '</script>');
fs.writeFileSync(path.join(DIST, 'index.html'), tpl);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log('\n预览就绪。注意：此模式无子集化字体（会回退系统字体）、无 SSG。');
spawn('node', ['scripts/serve.mjs', DIST], { cwd: ROOT, env: { ...process.env, BASE_PATH: BASE }, stdio: 'inherit' });
