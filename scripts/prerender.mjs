/**
 * prerender.mjs — 静态预渲染（债 5，SEO）
 *
 * 为什么需要：hash/CSR 路由下爬虫只能看到首页空壳。本脚本用无头 Chromium
 * 逐个访问每条路由，等 JS 渲染完成后抓取 DOM，写成真 HTML 文件。
 * 这样每个朝代/专题页都有可被搜索引擎收录的正文。
 *
 * 依赖：playwright（CI 里 `npx playwright install chromium` 自动拉二进制）
 * 用法：先 `node scripts/serve.mjs &` 起本地静态服务，再 `node scripts/prerender.mjs`
 *       （build.mjs 会自动串起来）
 *
 * 产出：dist/dynasty/<id>/index.html、dist/topic/<id>/index.html 等
 *       + sitemap.xml
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = process.env.PRERENDER_ORIGIN || 'http://127.0.0.1:4178';
const SITE = process.env.SITE_URL || 'https://example.github.io/huaxiaji';
const BASE = process.env.BASE_PATH || '/huaxiaji';

// 路由清单来自 manifest + 固定页
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'manifest.json'), 'utf-8'));
const routes = [
  '/',
  '/timeline', '/dynasties', '/topics', '/figures', '/contrast', '/map', '/about',
  ...manifest.dynasties.map(id => `/dynasty/${id}`),
  ...manifest.topics.map(id => `/topic/${id}`),
];

function outPath(route) {
  if (route === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, route.replace(/^\//, ''), 'index.html');
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let ok = 0, fail = 0;
  for (const route of routes) {
    const url = ORIGIN + BASE + route;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // 等业务标记：主内容容器有实际子节点
      await page.waitForFunction(() => {
        const m = document.querySelector('#app, #main, .page');
        return m && m.textContent && m.textContent.trim().length > 50;
      }, { timeout: 15000 }).catch(() => {});
      const html = await page.content();
      const dest = outPath(route);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, html);
      ok++;
      process.stdout.write(`  ✓ ${route}\n`);
    } catch (e) {
      fail++;
      process.stdout.write(`  ✗ ${route}  (${e.message.split('\n')[0]})\n`);
    }
  }
  await browser.close();

  // sitemap.xml
  const urls = routes.map(r => `  <url><loc>${SITE}${r === '/' ? '/' : r}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  // 404.html：GitHub Pages 对未知深链返回它；内含重定向脚本回到 SPA
  const notFound = fs.readFileSync(path.join(ROOT, 'src', '404.template.html'), 'utf-8')
    .replace(/__BASE__/g, BASE);
  fs.writeFileSync(path.join(DIST, '404.html'), notFound);

  console.log(`\n预渲染完成：成功 ${ok}，失败 ${fail}，sitemap ${routes.length} 条`);
  if (fail) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
