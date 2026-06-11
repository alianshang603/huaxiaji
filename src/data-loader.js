/**
 * data-loader.js — 运行时数据加载层（拆包版核心）
 *
 * 替代原单文件里的内联大数据。所有大数据块改为按需 fetch + 内存缓存。
 * 这段在主 HTML 的 script 标签最前面引入（或内联），先于业务逻辑。
 *
 * 暴露的全局：
 *   DATA_BASE      —— 数据目录基址（含 base path），由构建注入
 *   loadCore()     —— 首屏必须，把 core.json 的块挂成全局（DY/TOPICS/... 等）
 *   getDynasty(id) —— 异步取某朝 DETAIL[id]，结果并入全局 DETAIL 缓存
 *   getCompo(id)   —— 异步取分裂期 COMPO[id]
 *   getTopic(id)   —— 异步取 {data, diagram}，并入 TOPIC_DATA / TOPIC_DIAGRAM
 *   getGeo()       —— 地图数据（CN_PROV 等）
 *   getGovchart()  —— 政制图表数据
 *   getFigures()   —— 人物总库扁平表
 *   getSearchIndex()—— 全站搜索索引
 */
(function () {
  // base 由构建期替换 __BASE__；本地直接打开时回退到相对路径
  var BASE = (typeof __BASE__ !== 'undefined' ? __BASE__ : '');
  window.DATA_BASE = BASE + '/data';

  var cache = Object.create(null);

  function jget(url) {
    if (cache[url]) return cache[url];
    var p = fetch(url, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    }).catch(function (e) {
      delete cache[url]; // 失败不缓存，允许重试
      throw e;
    });
    cache[url] = p;
    return p;
  }

  // 这些全局会被业务代码直接读取；loader 负责把懒加载结果并进去
  window.DETAIL = window.DETAIL || {};
  window.COMPO = window.COMPO || {};
  window.TOPIC_DATA = window.TOPIC_DATA || {};
  window.TOPIC_DIAGRAM = window.TOPIC_DIAGRAM || {};

  window.loadCore = function () {
    return jget(window.DATA_BASE + '/core.json').then(function (core) {
      Object.keys(core).forEach(function (k) { window[k] = core[k]; });
      return core;
    });
  };

  window.getDynasty = function (id) {
    if (window.DETAIL[id]) return Promise.resolve(window.DETAIL[id]);
    return jget(window.DATA_BASE + '/dynasty/' + id + '.json').then(function (d) {
      window.DETAIL[id] = d; return d;
    });
  };

  window.getCompo = function (id) {
    if (window.COMPO[id]) return Promise.resolve(window.COMPO[id]);
    return jget(window.DATA_BASE + '/compo/' + id + '.json').then(function (d) {
      window.COMPO[id] = d; return d;
    });
  };

  window.getTopic = function (id) {
    if (window.TOPIC_DATA[id] || window.TOPIC_DIAGRAM[id]) {
      return Promise.resolve({ data: window.TOPIC_DATA[id], diagram: window.TOPIC_DIAGRAM[id] });
    }
    return jget(window.DATA_BASE + '/topic/' + id + '.json').then(function (t) {
      if (t.data) window.TOPIC_DATA[id] = t.data;
      if (t.diagram) window.TOPIC_DIAGRAM[id] = t.diagram;
      return t;
    });
  };

  window.getGeo = function () { return jget(window.DATA_BASE + '/geo.json'); };
  window.getGovchart = function () { return jget(window.DATA_BASE + '/govchart.json'); };
  window.getFigures = function () { return jget(window.DATA_BASE + '/figures.json'); };
  window.getSearchIndex = function () { return jget(window.DATA_BASE + '/search-index.json'); };

  // 给“整朝数据”一次性预热的辅助（人物库/搜索改用索引后通常不需要）
  window.warmAllDynasties = function () {
    return getSearchIndex().then(function (idx) {
      return Promise.all(idx.dynasties.map(function (d) { return getDynasty(d.id); }));
    });
  };
})();
