/**
 * router-history.js — 把原 hash 路由改造为 History API 路由（债 5 的运行时部分）
 *
 * 替换原文件结尾这一段：
 *   function nav(b){location.hash='#/'+b;} ... window.addEventListener('hashchange',go); if(!location.hash)...
 *
 * 关键改造点：
 *  1. 地址形式：'#/dynasty/tang' → '<base>/dynasty/tang'（可被预渲染与收录）
 *  2. nav()/链接：用 pushState 代替改 hash；拦截站内 <a> 点击
 *  3. fillDynasty/fillTopic/renderContrast/renderMap 改 async：先 await 数据再渲染
 *  4. 保留原 navStack「后退不变前进」逻辑，键名从 hash 换成 path
 *  5. 处理 404.html 写入 sessionStorage 的 __spa_redirect__，首帧还原深链接
 *
 * 依赖 data-loader.js 暴露的 getDynasty/getCompo/getTopic/getGeo 等。
 */

// BASE 由构建注入（与 data-loader 同源）
var BASE = (typeof __BASE__ !== 'undefined' ? __BASE__ : '');

function pathOf() {
  var p = location.pathname;
  if (BASE && p.indexOf(BASE) === 0) p = p.slice(BASE.length);
  return p.replace(/^\/+/, '') || 'home';      // 'dynasty/tang'
}
function toURL(route) {                          // 'dynasty/tang' → '<base>/dynasty/tang'
  return (BASE || '') + '/' + String(route).replace(/^\/+/, '');
}
function nav(route) { pushRoute(route); }
function pushRoute(route) {
  if (pathOf() === route) return;
  history.pushState({ route: route }, '', toURL(route));
  go();
}

var curPath = '', scrollMem = new Map(), navStack = [], suppressPush = false, tlInit = false;
var DETAIL_PAGES = ['dynasty', 'topic', 'contrast'];

function contextualParent() {
  var b = pathOf().split('/')[0];
  return ({ dynasty: 'home', topic: 'topics', contrast: 'topics', figures: 'home', search: 'home', map: 'home', about: 'home' })[b] || 'home';
}
function goBack() {
  var prev = navStack.pop();
  if (prev) { suppressPush = true; pushRoute(prev); }
  else { nav(contextualParent()); }
}

// 渲染分发改为 async：详情页先 await 数据
async function go() {
  var route = pathOf();
  if (route === curPath) return;
  if (curPath) {
    scrollMem.set(curPath, window.scrollY);
    if (scrollMem.size > 80) scrollMem.delete(scrollMem.keys().next().value);
  }
  if (curPath && !suppressPush) {
    if (navStack.length && navStack[navStack.length - 1] === route) navStack.pop();
    else { navStack.push(curPath); if (navStack.length > 60) navStack.shift(); }
  }
  suppressPush = false;

  var parts = route.split('/'), base = parts[0], param = parts[1];
  if (!PAGES.includes(base)) base = 'home';

  var TMAP = { home: '华夏纪 · 中国历代王朝', dynasties: '朝代总览 · 华夏纪', topics: '跨朝专题 · 华夏纪', figures: '人物总库 · 华夏纪', contrast: '朝代对照 · 华夏纪', search: '搜索 · 华夏纪', map: '历史地图 · 华夏纪', about: '关于 · 华夏纪' };
  if (TMAP[base]) document.title = TMAP[base];

  try {
    if (base === 'dynasty') { showLoading('page-dynasty'); await fillDynasty(param); }
    else if (base === 'topic') { showLoading('page-topic'); await fillTopic(param); }
    else if (base === 'contrast') { await renderContrast(param); }
    else if (base === 'figures') { await renderFigures(); }
    else if (base === 'search') { await renderSearch(document.getElementById('q').value); }
    else if (base === 'map') { await renderMap(); }
  } catch (e) {
    console.error('加载失败', route, e);
    showError(base, route);
  }

  PAGES.forEach(function (p) { document.getElementById('page-' + p).classList.toggle('show', p === base); });
  var navmap = { dynasty: 'dynasties', topic: 'topics', contrast: 'topics' };
  var act = navmap[base] || base;
  document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.b === act); });
  if (typeof toggleNav === 'function') toggleNav(false);
  document.getElementById('fabBack').classList.toggle('show', DETAIL_PAGES.includes(base));
  if (base === 'home' && !tlInit) { tlInit = true; var sc = document.getElementById('tlscroll'); if (sc) requestAnimationFrame(function () { sc.scrollLeft = Math.max(0, xpos(-221) - 24); }); }

  curPath = route;
  var y = scrollMem.get(curPath) || 0;
  requestAnimationFrame(function () { try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); } });
}

function showLoading(pageId) {
  var host = document.querySelector('#' + pageId + ' [data-mods], #' + pageId + ' #dynModules, #' + pageId + ' #topicBody');
  if (host) host.innerHTML = '<div class="skeleton" aria-busy="true"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
}
function showError(base, route) {
  var host = document.getElementById('page-' + base);
  if (host) host.insertAdjacentHTML('afterbegin', '<div class="loaderr">内容加载失败。<button onclick="curPath=\'\';go()">重试</button></div>');
}

// 拦截站内链接点击 → pushState（外链、新窗口、修饰键放行）
document.addEventListener('click', function (e) {
  // data-route（由原内联 location.hash 转换而来）
  var dr = e.target.closest('[data-route]');
  if (dr) { e.preventDefault(); pushRoute(dr.getAttribute('data-route')); return; }
  var a = e.target.closest('a');
  if (!a) return;
  var href = a.getAttribute('href') || '';
  if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // 兼容历史写法 '#/dynasty/tang' 与新写法 '/dynasty/tang'
  var route = null;
  if (href.indexOf('#/') === 0) route = href.slice(2);
  else if (href.indexOf(BASE + '/') === 0) route = href.slice((BASE + '/').length);
  else if (href.indexOf('/') === 0 && href.indexOf('//') !== 0) route = href.replace(/^\/+/, '');
  if (route == null) return;
  e.preventDefault();
  pushRoute(route);
});

window.addEventListener('popstate', go);

// 首帧：还原 404.html 暂存的深链接；否则正常进入
(function boot() {
  var redir = null;
  try { redir = sessionStorage.getItem('__spa_redirect__'); sessionStorage.removeItem('__spa_redirect__'); } catch (e) {}
  loadCore().then(function () {
    assignLanes(); renderTimeline(); renderGrid(); renderTopics(); renderContrastPanel(); renderSearch('');
    syncHeaderH();
    if (redir) {
      var r = redir.replace(/^\/+/, '') || 'home';
      history.replaceState({ route: r }, '', toURL(r));
    } else if (!location.pathname || pathOf() === '') {
      history.replaceState({ route: 'home' }, '', toURL('home'));
    }
    go();
  }).catch(function (e) {
    document.body.insertAdjacentHTML('afterbegin', '<div class="loaderr">核心数据加载失败，请刷新重试。</div>');
    console.error(e);
  });
})();
