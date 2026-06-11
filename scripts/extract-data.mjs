/**
 * extract-data.mjs — 从原始单文件 华夏纪.html 无损抽取全部数据块为 JSON。
 *
 * 设计：原文件所有数据块经探测确认为纯数据（零函数、可 JSON 序列化），
 * 因此在与浏览器同构的最小 DOM mock 下 eval 整段脚本，取出全局对象后写盘。
 * 这样拆分是机械且可逆的，不依赖脆弱的正则切割。
 *
 * 用法：node scripts/extract-data.mjs <源html> <输出目录>
 * 默认：node scripts/extract-data.mjs ./华夏纪.src.html ./public/data
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || path.join(__dirname, '..', '华夏纪.src.html');
const OUT = process.argv[3] || path.join(__dirname, '..', 'public', 'data');

const html = fs.readFileSync(SRC, 'utf-8');
const js = html
  .slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'))
  // syncHeaderH 含 DOM 测量，抽取阶段 stub 掉，避免 mock 噪声
  .replace(/function syncHeaderH\(\)\{[^}]*\}/, 'function syncHeaderH(){}');

// ---- 最小 DOM mock：只需让脚本能 eval 到底、拿到数据 ----
const E = new Map();
const mk = (id) => ({
  id, innerHTML: '', textContent: '', value: '', dataset: {},
  style: { setProperty() {}, removeProperty() {} },
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
  setAttribute() {}, getAttribute() { return null; }, appendChild() {},
  scrollLeft: 0, clientWidth: 800, offsetParent: null, offsetHeight: 80,
  scrollIntoView() {}, focus() {}, click() {},
  getBoundingClientRect() { return { width: 800, height: 53, left: 0, top: 0 }; },
  closest() { return null; },
});
globalThis.document = {
  getElementById(id) { if (!E.has(id)) E.set(id, mk(id)); return E.get(id); },
  querySelector(s) { return mk(s); }, querySelectorAll() { return []; },
  addEventListener() {},
  body: { style: {}, classList: { toggle() { return false; }, add() {}, remove() {}, contains() { return false; } } },
  documentElement: { style: { setProperty() {} }, classList: { add() {}, toggle() {}, contains() { return false; } } },
  title: '', activeElement: null,
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.scrollTo = () => {}; globalThis.scrollY = 0;
globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.location = { hash: '', href: '' };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.requestAnimationFrame = () => {};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };

// 所有数据块名（探测确认全为纯数据）
const BLOCKS = ['DY','TOPICS','TGROUPS','TOPIC_SEE','CONTRASTS','MODULES','BANDS','SUBC',
  'DETAIL','EVCAT','CATNAME','FIGGRP','FIGRATE','RAREPY','POLYPY','COMPO','SCHEMATIC',
  'GOVNOTE','GOVCHART','DCAP','TOPIC_DATA','TOPIC_DIAGRAM','FERA','FROLE','FRN',
  'PERIODS_INFO','CAPS','CNGEO','CN_PROV','CN_HE','CN_JIANG','DYN_CAP','PAGES','DETAIL_PAGES'];

// 把数据块暴露到一个收集对象里
const collector = `;globalThis.__DATA__={};${BLOCKS.map(b => `try{globalThis.__DATA__.${b}=${b};}catch(e){}`).join('')}`;
eval(js + collector);
const DATA = globalThis.__DATA__;

// ---- 拆分策略 ----
// core.json：所有小数据块（<8KB），首屏即用的骨架
// dynasty/<id>.json：每个朝代/时期的 DETAIL[id]（懒加载）
// compo/<id>.json：分裂期 COMPO[id]（懒加载）
// topic/<id>.json：每个专题的 TOPIC_DATA[id] + TOPIC_DIAGRAM[id]（懒加载）
// geo.json：CN_PROV + CN_HE + CN_JIANG + CNGEO（仅地图页懒加载）
const CORE_BLOCKS = BLOCKS.filter(b => !['DETAIL','COMPO','TOPIC_DATA','TOPIC_DIAGRAM','CN_PROV','CN_HE','CN_JIANG','CNGEO','GOVCHART'].includes(b));

fs.mkdirSync(path.join(OUT, 'dynasty'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'compo'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'topic'), { recursive: true });

const write = (rel, obj) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
  return fs.statSync(p).size;
};

let report = [];

// core
const core = {};
CORE_BLOCKS.forEach(b => { if (DATA[b] !== undefined) core[b] = DATA[b]; });
report.push(['core.json', write('core.json', core)]);

// dynasty DETAIL（逐 id）
const dynIndex = {};
for (const id of Object.keys(DATA.DETAIL || {})) {
  const sz = write(`dynasty/${id}.json`, DATA.DETAIL[id]);
  dynIndex[id] = sz;
}
report.push([`dynasty/* (${Object.keys(dynIndex).length} files)`, Object.values(dynIndex).reduce((a, b) => a + b, 0)]);

// compo（逐 id）
for (const id of Object.keys(DATA.COMPO || {})) {
  write(`compo/${id}.json`, DATA.COMPO[id]);
}
report.push([`compo/* (${Object.keys(DATA.COMPO || {}).length} files)`, 0]);

// topic（TOPIC_DATA + TOPIC_DIAGRAM 合并，逐 id）
const topicIds = new Set([...Object.keys(DATA.TOPIC_DATA || {}), ...Object.keys(DATA.TOPIC_DIAGRAM || {})]);
for (const id of topicIds) {
  write(`topic/${id}.json`, {
    data: (DATA.TOPIC_DATA || {})[id] || null,
    diagram: (DATA.TOPIC_DIAGRAM || {})[id] || null,
  });
}
report.push([`topic/* (${topicIds.size} files)`, 0]);

// geo（地图专用）+ GOVCHART
write('geo.json', { CN_PROV: DATA.CN_PROV, CN_HE: DATA.CN_HE, CN_JIANG: DATA.CN_JIANG, CNGEO: DATA.CNGEO });
report.push(['geo.json', fs.statSync(path.join(OUT, 'geo.json')).size]);
write('govchart.json', DATA.GOVCHART);
report.push(['govchart.json', fs.statSync(path.join(OUT, 'govchart.json')).size]);

// manifest：运行时据此知道哪些 id 走懒加载
write('manifest.json', {
  dynasties: Object.keys(DATA.DETAIL || {}),
  compos: Object.keys(DATA.COMPO || {}),
  topics: [...topicIds],
  generated: new Date().toISOString(),
});

// ---- 派生索引：让人物库与全站搜索无需加载 28 个 DETAIL 文件 ----
// figures.json：470 人扁平表（buildFigs 的预计算结果）
const FIGS = [];
for (const d of (DATA.DY || [])) {
  const D = (DATA.DETAIL || {})[d.id];
  if (!D || !D.fig) continue;
  for (const p of D.fig) {
    FIGS.push({
      name: p[0], role: p[1], dates: p[2], intro: p[3],
      grp: p[4] || (DATA.FIGGRP || {})[p[0]] || 'chen',
      bio: (D.bios && D.bios[p[0]]) || '',
      rate: (DATA.FIGRATE || {})[p[0]] || null,
      dyId: d.id, dyName: d.name, col: d.c, era: d.grp,
    });
  }
}
write('figures.json', FIGS);
report.push([`figures.json (${FIGS.length} 人)`, fs.statSync(path.join(OUT, 'figures.json')).size]);

// search-index.json：全站事件 + 朝代 + 专题的检索表
const SEARCH = { events: [], dynasties: [], topics: [] };
for (const d of (DATA.DY || [])) {
  SEARCH.dynasties.push({ id: d.id, name: d.name, full: d.full, s: d.s, e: d.e, col: d.c });
  const D = (DATA.DETAIL || {})[d.id];
  if (D && D.events) for (const e of D.events) {
    SEARCH.events.push({ y: e[0], t: e[1], desc: e[2], dyName: d.name, dyId: d.id, col: d.c });
  }
}
for (const t of (DATA.TOPICS || [])) {
  SEARCH.topics.push({ id: t[0], seal: t[1], name: t[2], desc: t[3] });
}
write('search-index.json', SEARCH);
report.push([`search-index.json (${SEARCH.events.length} 事件)`, fs.statSync(path.join(OUT, 'search-index.json')).size]);

console.log('=== 数据抽取完成 ===');
report.forEach(([name, sz]) => console.log(`  ${name.padEnd(34)} ${sz ? (sz / 1024).toFixed(1) + ' KB' : ''}`));
console.log(`核心包(core.json)块: ${CORE_BLOCKS.join(', ')}`);
