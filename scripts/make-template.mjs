/**
 * make-template.mjs — 从修复版单文件生成拆包用的 index.template.html
 *
 * 做三件事（确定性、可重跑）：
 *  1. 剥离已外置的数据块（const DY=… 到 const DYN_CAP=…），换成 <!--DATA_LOADER--> 占位
 *     —— PAGES / DETAIL_PAGES 这两个与路由强耦合的小数组保留内联。
 *  2. 把 6 个数据访问渲染函数（fillDynasty/fillTopic/renderContrast/renderMap/
 *     renderFigures/renderSearch）改成 async，并在函数体最前面插入对应的 await 加载。
 *  3. 用 router-history.js 整段替换原 hash 路由尾段。
 *
 * 用法：node scripts/make-template.mjs
 * 产出：src/index.template.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '华夏纪.src.html');
const ROUTER = fs.readFileSync(path.join(ROOT, 'src', 'router-history.js'), 'utf-8');

let html = fs.readFileSync(SRC, 'utf-8');
const sTag = html.lastIndexOf('<script>');
const eTag = html.lastIndexOf('</script>');
const head = html.slice(0, sTag + '<script>'.length);
let js = html.slice(sTag + '<script>'.length, eTag);
const tail = html.slice(eTag);

// ---- 1) 逐块剥离数据声明（brace 匹配，保留交错的函数）----
// 外置的数据块（PAGES/DETAIL_PAGES 保留内联，路由要用；
//  RAREPY/POLYPY/FRN/FROLE/FERA 等 py() 注音同步依赖的小字典也保留内联，避免初始化竞态）
const STRIP = ['DY','TOPICS','TGROUPS','TOPIC_SEE','CONTRASTS','MODULES','BANDS','SUBC',
  'DETAIL','EVCAT','CATNAME','FIGGRP','FIGRATE','COMPO','SCHEMATIC',
  'GOVNOTE','GOVCHART','DCAP','TOPIC_DATA','TOPIC_DIAGRAM',
  'PERIODS_INFO','CAPS','CNGEO','CN_PROV','CN_HE','CN_JIANG','DYN_CAP'];

function stripDecl(src, name) {
  // 同时匹配独立声明 (const NAME=) 与逗号连续声明前的 NAME=
  const re = new RegExp('(\\n(?:const|let|var)\\s+|,\\s*)' + name + '\\s*=\\s*[\\[{]');
  const m = src.match(re);
  if (!m) { console.warn('  未找到数据块（跳过）：', name); return src; }
  const lead = m[1];                            // '\nconst ' 或 ',' 
  const open = m.index + m[0].length - 1;       // 指向首个 [ 或 {
  const openCh = src[open], closeCh = openCh === '[' ? ']' : '}';
  let i = open + 1, depth = 1, inStr = null;
  while (i < src.length && depth) {
    const c = src[i];
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; }
    else if (c === '"' || c === "'" || c === '`') inStr = c;
    else if (c === openCh) depth++;
    else if (c === closeCh) depth--;
    i++;
  }
  const term = src[i];                          // ';' 或 ',' 或其他
  const isLeadConst = /\b(?:const|let|var)\b/.test(lead);
  let cut;
  if (term === ';') { cut = i + 1; return src.slice(0, m.index) + (isLeadConst ? '\n' : '') + src.slice(cut); }
  if (term === ',') {
    // 连续声明：删掉本块，让后继声明继续。若本块带 const，把 const 让给后继。
    cut = i + 1; // 跳过逗号
    const rest = src.slice(cut).replace(/^\s*/, '');
    return src.slice(0, m.index) + (isLeadConst ? '\nconst ' : '') + rest;
  }
  // 其他情况（直接换行结束的对象，少见）：保守删到 i
  return src.slice(0, m.index) + (isLeadConst ? '\n' : '') + src.slice(i);
}
for (const name of STRIP) js = stripDecl(js, name);
js = js.replace(/function fillDynasty/, '/* 数据块已外置，运行时由 data-loader 注入 */\nfunction fillDynasty');

// ---- 2) 渲染函数转 async + 注入 await 加载 ----
// 每条规则：把 function NAME(args){  改成 async function NAME(args){ <await>
const asyncPatches = [
  // fillDynasty(id)：需要 DETAIL[id]，分裂期还需 COMPO[id]
  { re: /function fillDynasty\(id\)\{/, ins: 'async function fillDynasty(id){ await getDynasty(id).catch(()=>{}); if(typeof COMPO!=="undefined"||true){ try{ await getCompo(id); }catch(e){} }' },
  // fillTopic(id)：需要 TOPIC_DATA[id] + TOPIC_DIAGRAM[id]
  { re: /function fillTopic\(id\)\{/, ins: 'async function fillTopic(id){ await getTopic(id).catch(()=>{});' },
  // renderContrast(id)：对照需要两侧朝代 DETAIL —— 由函数内部读取，预拉全部相关朝代较稳妥
  { re: /function renderContrast\(id\)\{/, ins: 'async function renderContrast(id){ try{ var _c=(CONTRASTS||[]).find(function(x){return x.id===id;}); if(_c&&_c.ids) await Promise.all(_c.ids.map(function(d){return getDynasty(d).catch(function(){});})); }catch(e){}' },
  // renderMap()：需要 geo 数据
  { re: /function renderMap\(\)\{/, ins: 'async function renderMap(){ try{ var _g=await getGeo(); window.CN_PROV=_g.CN_PROV; window.CN_HE=_g.CN_HE; window.CN_JIANG=_g.CN_JIANG; window.CNGEO=_g.CNGEO; }catch(e){}' },
  // renderFigures()：用 figures 索引（不必加载 28 个 DETAIL）
  { re: /function renderFigures\(\)\{/, ins: 'async function renderFigures(){ try{ window.__FIGS__=await getFigures(); }catch(e){}' },
  // renderSearch(q)：用 search 索引
  { re: /function renderSearch\(([^)]*)\)\{/, ins: 'async function renderSearch($1){ try{ window.__SEARCH__=await getSearchIndex(); }catch(e){}' },
];
for (const p of asyncPatches) {
  if (!p.re.test(js)) { console.warn('  未匹配（可能命名不同，跳过）：', p.re); continue; }
  js = js.replace(p.re, p.ins);
}

// buildFigs/搜索遍历改用索引：若存在 buildFigs，注入"优先用 __FIGS__"
js = js.replace(/function buildFigs\(\)\{/, 'function buildFigs(){ if(window.__FIGS__) return window.__FIGS__;');

// ---- 清理残留的 hash 写法，统一走 History 路由 ----
//   location.hash='#/dynasty/'+x  → nav('dynasty/'+x)
js = js.replace(/location\.hash\s*=\s*'#\/'\s*\+\s*([^;]+);/g, 'nav($1);');
js = js.replace(/location\.hash\s*=\s*'#\/(dynasty|topic|contrast)\/'\s*\+\s*([^;]+);/g, "nav('$1/'+$2);");
//   onclick="location.hash='#/topic/xx'"（模板字符串里）→ 用 data-route，交由委托
js = js.replace(/onclick=\\?["']location\.hash=\\?['"]#\/([^'"\\]+)\\?['"]\\?["']/g, 'data-route="$1"');
//   (location.hash||'').indexOf('search') → 用 pathOf()
js = js.replace(/\(location\.hash\s*\|\|\s*''\)\.indexOf\('search'\)\s*>\s*-1/g, "pathOf().indexOf('search')===0");

// tcard / dcard 模板字符串里的 onclick="location.hash='#/...'+x+''" → data-route（交事件委托）
// 函数式 replace，已隔离验证：onclick="location.hash=\'#/topic/'+t[0]+'\'" → data-route="topic/'+t[0]+'"
js = js.replace(
  /onclick="location\.hash=\\'#\/(topic|contrast)\/'\+([^"]+?)\+'\\'"/g,
  (m, base, expr) => `data-route="${base}/'+${expr}+'"`
);

// ---- 3) 替换 hash 路由尾段为 History 路由（按精确锚点切割，避免脆弱正则）----
// 原 tail 结构：[nav/goBack/go 路由部分] [syncThemeMeta..syncHeaderH 辅助函数] [init+hash监听]
const navAt = js.search(/function nav\(b\)\{/);
if (navAt < 0) throw new Error('定位 nav 失败');
const keepStart = js.indexOf('function syncThemeMeta', navAt);
if (keepStart < 0) throw new Error('定位 syncThemeMeta 失败');
// keep 部分保留到原 init 行之前；这些尾部 init/hash 监听由 router 的 boot() 接管
const initAt = js.indexOf('assignLanes();renderTimeline()', keepStart);
const keepEnd = initAt > 0 ? initAt : js.indexOf("window.addEventListener('hashchange'", keepStart);
if (keepEnd < 0) throw new Error('定位 keep 结束失败');
const keepPart = js.slice(keepStart, keepEnd);   // syncThemeMeta..syncHeaderH + 主题恢复 + (about注音/keydown若在此前)

// keydown 代理在 init 之后，需单独保留
const keydownPart = (js.slice(keepEnd).match(/document\.addEventListener\('keydown',function\(e\)\{[\s\S]*?\}\);/) || [''])[0];
// about 页注音那行也保留
const aboutPy = (js.slice(keepEnd).match(/\(function\(\)\{var ab=document\.getElementById\('page-about'\);[\s\S]*?\}\)\(\);/) || [''])[0];

js = js.slice(0, navAt)
  + '\n/* ===== 保留：主题/导航/header 辅助函数（verbatim）===== */\n' + keepPart
  + '\n' + aboutPy + '\n' + keydownPart
  + '\n/* ===== History 路由（替换原 hash 路由 + 初始化由 boot 接管）===== */\n' + ROUTER + '\n';

// ---- 组装模板 ----
// 在主 <script> 前插入 <!--DATA_LOADER--> 占位（build.mjs 会注入 loader）
let out = head.replace('<script>', '<!--DATA_LOADER-->\n<script>') + js + tail;
// 字体：把 Google Fonts 链接替换为本地子集（@font-face 注入到 </head> 前）
const fontFace = `
<style id="local-font">
@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:400;font-display:swap;src:url(__BASE__/fonts/noto-serif-sc-400-subset.woff2) format('woff2');}
@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:600;font-display:swap;src:url(__BASE__/fonts/noto-serif-sc-600-subset.woff2) format('woff2');}
</style>`;
out = out.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '')
         .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/g, '')
         .replace('</head>', fontFace + '\n</head>');

fs.writeFileSync(path.join(ROOT, 'src', 'index.template.html'), out);
console.log('已生成 src/index.template.html （', (out.length / 1024).toFixed(0), 'KB）');
console.log('提醒：模板内 __BASE__ 由 build.mjs 注入；数据由 data-loader 异步加载。');
